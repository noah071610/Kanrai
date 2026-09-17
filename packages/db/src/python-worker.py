"""
Child process: reads Django / SQLAlchemy / SQLModel models with the stdlib
`ast` module and prints `{ tables, diagnostics }` as JSON to stdout.

Input on stdin: `{ "orm": "...", "files": [{ "path": "...", "text": "..." }] }`.
Nothing is imported or executed — settings, env vars and DB connections are
never needed. Needs Python 3.9+ (`ast.unparse`).
"""
import ast
import json
import sys


def name_of(node):
    """`models.CharField` → `CharField`, `Mapped` → `Mapped`."""
    if isinstance(node, ast.Attribute):
        return node.attr
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Subscript):
        return name_of(node.value)
    if isinstance(node, ast.Call):
        return name_of(node.func)
    return None


def literal(node, default=None):
    try:
        return ast.literal_eval(node)
    except Exception:
        return default


def kwargs(call):
    return {k.arg: k.value for k in call.keywords if k.arg}


def kw_literal(call, key, default=None):
    value = kwargs(call).get(key)
    return default if value is None else literal(value, default)


class ClassInfo:
    def __init__(self, node, path):
        self.node = node
        self.path = path
        self.name = node.name
        self.bases = [name_of(b) for b in node.bases]
        self.keywords = {k.arg: literal(k.value) for k in node.keywords if k.arg}
        self.meta = {}
        for stmt in node.body:
            if isinstance(stmt, ast.ClassDef) and stmt.name == "Meta":
                for s in stmt.body:
                    if isinstance(s, ast.Assign):
                        for t in s.targets:
                            if isinstance(t, ast.Name):
                                self.meta[t.id] = s.value

    def assigned(self, key):
        for stmt in self.node.body:
            if isinstance(stmt, ast.Assign) and any(isinstance(t, ast.Name) and t.id == key for t in stmt.targets):
                return stmt.value
            if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name) and stmt.target.id == key:
                return stmt.value
        return None


def collect(files, diagnostics):
    classes, modules = {}, []
    for f in files:
        try:
            tree = ast.parse(f["text"], filename=f["path"])
        except SyntaxError as e:
            diagnostics.append({
                "code": "db-parse", "severity": "warning", "filePath": f["path"], "line": e.lineno or 1,
                "message": "Python could not parse this file: %s" % e.msg,
            })
            continue
        modules.append((f["path"], tree))
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                # ponytail: one namespace for all files; same-named models in two apps collide.
                classes[node.name] = ClassInfo(node, f["path"])
    return classes, modules


def chain(info, classes, depth=0):
    """Project-defined ancestors first, then the class itself."""
    out = []
    for base in info.bases:
        parent = classes.get(base)
        if parent and parent is not info and depth < 20:
            out += chain(parent, classes, depth + 1)
    return out + [info]


def inherits(info, classes, names, depth=0):
    if any(b in names for b in info.bases):
        return True
    return depth < 20 and any(
        b in classes and classes[b] is not info and inherits(classes[b], classes, names, depth + 1)
        for b in info.bases
    )


ENUM_BASES = {"Enum", "StrEnum", "IntEnum", "TextChoices", "IntegerChoices", "Choices"}


def enum_members(info, classes, values):
    """Django choices store values; SQLAlchemy's Enum stores member names by default."""
    if not inherits(info, classes, ENUM_BASES):
        return None
    out = []
    for stmt in info.node.body:
        if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name):
            key = stmt.targets[0].id
            if key.startswith("_"):
                continue
            if not values:
                out.append(key)
                continue
            v = literal(stmt.value)
            if isinstance(v, tuple) and v:
                v = v[0]
            out.append(str(v) if v is not None else key)
    return out or None


def column(name, type_, nullable, unique, primary, enum_values=None):
    col = {"name": name, "type": type_, "nullable": nullable, "unique": unique, "primary": primary}
    if enum_values:
        col["enumValues"] = enum_values
    return col


def table(name, model, path, line, columns, uniques):
    """Same conventions as the Prisma reader: a lone primary key is unique, a composite one is listed in `uniques`."""
    primary = [c for c in columns if c["primary"]]
    if len(primary) == 1:
        primary[0]["unique"] = True
    out = {"name": name}
    if model and model != name:
        out["model"] = model
    out.update({"filePath": path, "line": line, "columns": columns})
    out["uniques"] = [[c["name"] for c in primary]] + uniques if len(primary) > 1 else uniques
    return out


# --- SQLAlchemy / SQLModel ---------------------------------------------------

NOT_COLUMNS = {"relationship", "Relationship", "association_proxy", "column_property", "synonym", "composite", "query_expression", "deferred"}


def unwrap_optional(ann):
    """`Optional[X]` / `X | None` / `Union[X, None]` → (X, True)."""
    if isinstance(ann, ast.Constant) and isinstance(ann.value, str):
        try:
            ann = ast.parse(ann.value, mode="eval").body
        except SyntaxError:
            return ann, False
    if isinstance(ann, ast.Subscript) and name_of(ann.value) == "Optional":
        return ann.slice, True
    if isinstance(ann, ast.BinOp) and isinstance(ann.op, ast.BitOr):
        parts = [p for p in (ann.left, ann.right) if not (isinstance(p, ast.Constant) and p.value is None)]
        if len(parts) == 1:
            return parts[0], True
    if isinstance(ann, ast.Subscript) and name_of(ann.value) == "Union" and isinstance(ann.slice, ast.Tuple):
        parts = [p for p in ann.slice.elts if not (isinstance(p, ast.Constant) and p.value is None)]
        if len(parts) == 1:
            return parts[0], len(parts) != len(ann.slice.elts)
    return ann, False


def sa_column(call, attr, ann, classes):
    """`mapped_column(...)` / `Column(...)` / SQLModel `Field(sa_column=Column(...))`."""
    name, type_node = attr, None
    for arg in call.args if call else []:
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
            name = arg.value
        elif type_node is None and name_of(arg) not in ("ForeignKey", "Sequence", "Identity", "Computed"):
            type_node = arg
    if call is not None and "type_" in kwargs(call):
        type_node = kwargs(call)["type_"]

    inner, optional = unwrap_optional(ann) if ann is not None else (None, False)
    if inner is not None and name_of(inner) == "Mapped" and isinstance(inner, ast.Subscript):
        inner, optional = unwrap_optional(inner.slice)

    primary = bool(call is not None and kw_literal(call, "primary_key", False))
    enum_node = type_node.args[0] if isinstance(type_node, ast.Call) and name_of(type_node) == "Enum" and type_node.args else inner
    enum_info = classes.get(name_of(enum_node)) if enum_node is not None else None

    if type_node is not None:
        type_ = ast.unparse(type_node)
    elif inner is not None:
        type_ = ast.unparse(inner)
    else:
        type_ = "unknown"

    explicit = kw_literal(call, "nullable") if call is not None else None
    if explicit is not None:
        nullable = bool(explicit)
    elif primary:
        nullable = False
    elif ann is not None:
        nullable = optional
    else:
        nullable = True  # legacy `Column()` default
    return column(
        name, type_, nullable, bool(call is not None and kw_literal(call, "unique", False)), primary,
        enum_members(enum_info, classes, values=False) if enum_info else None,
    )


def sa_uniques(table_args):
    out = []
    items = table_args.elts if isinstance(table_args, (ast.Tuple, ast.List)) else []
    for item in items:
        if isinstance(item, ast.Call) and name_of(item) == "UniqueConstraint":
            cols = [literal(a) for a in item.args]
            if cols and all(isinstance(c, str) for c in cols):
                out.append(cols)
    return out


def sqlalchemy_columns(info, classes, sqlmodel):
    columns = {}
    for stmt in info.node.body:
        if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
            attr, ann, value = stmt.target.id, stmt.annotation, stmt.value
        elif isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name):
            attr, ann, value = stmt.targets[0].id, None, stmt.value
        else:
            continue
        if attr.startswith("__") or name_of(ann) == "ClassVar":
            continue
        call = value if isinstance(value, ast.Call) else None
        callee = name_of(call) if call else None
        if callee in NOT_COLUMNS:
            continue

        if sqlmodel:
            if ann is None:
                continue
            sa = kwargs(call).get("sa_column") if callee == "Field" else None
            if isinstance(sa, ast.Call):
                columns[attr] = sa_column(sa, attr, ann, classes)
                continue
            col = sa_column(None, attr, ann, classes)
            if callee == "Field":
                col["primary"] = bool(kw_literal(call, "primary_key", False))
                col["unique"] = bool(kw_literal(call, "unique", False))
                explicit = kw_literal(call, "nullable")
                # SQLModel: Optional means nullable, except on the primary key.
                col["nullable"] = bool(explicit) if explicit is not None else (col["nullable"] and not col["primary"])
                if "sa_type" in kwargs(call):
                    col["type"] = ast.unparse(kwargs(call)["sa_type"])
            columns[attr] = col
        elif callee in ("mapped_column", "Column"):
            columns[attr] = sa_column(call, attr, ann, classes)
        elif ann is not None and value is None and name_of(ann) == "Mapped":
            columns[attr] = sa_column(None, attr, ann, classes)
    return columns


def read_sqlalchemy(classes, modules, sqlmodel):
    tables = []
    for info in list(classes.values()):
        if sqlmodel:
            if info.keywords.get("table") is not True:
                continue
        elif literal(info.assigned("__abstract__")) is True or not isinstance(literal(info.assigned("__tablename__")), str):
            continue

        columns, uniques = {}, []
        for part in chain(info, classes):
            columns.update(sqlalchemy_columns(part, classes, sqlmodel))
            table_args = part.assigned("__table_args__")
            if table_args is not None:
                uniques = sa_uniques(table_args)
        name = literal(info.assigned("__tablename__"))
        if not isinstance(name, str):
            name = info.name.lower()  # SQLModel default
        tables.append(table(name, info.name, info.path, info.node.lineno, list(columns.values()), uniques))

    if not sqlmodel:
        # Imperative `users = Table("users", metadata, Column(...), ...)`.
        for path, tree in modules:
            for node in ast.walk(tree):
                if isinstance(node, ast.Call) and name_of(node) == "Table" and node.args and isinstance(literal(node.args[0]), str):
                    cols = [sa_column(a, "?", None, classes) for a in node.args if isinstance(a, ast.Call) and name_of(a) == "Column"]
                    uniques = sa_uniques(ast.Tuple(elts=[a for a in node.args if isinstance(a, ast.Call)]))
                    tables.append(table(literal(node.args[0]), None, path, node.lineno, cols, uniques))
    return tables


# --- Django ------------------------------------------------------------------

RELATIONS = {"ForeignKey", "OneToOneField"}


def app_label(info):
    meta = literal(info.meta.get("app_label"))
    if isinstance(meta, str):
        return meta
    parts = info.path.split("/")[:-1]
    if parts and parts[-1] == "models":  # models/ package
        parts = parts[:-1]
    return parts[-1] if parts else ""


def django_field_name(attr, call):
    db_column = kw_literal(call, "db_column")
    if isinstance(db_column, str):
        return db_column
    return attr + "_id" if name_of(call) in RELATIONS else attr


def django_choices(call, classes):
    node = kwargs(call).get("choices")
    if node is None:
        return None
    info = classes.get(name_of(node.value) if isinstance(node, ast.Attribute) else name_of(node))
    if info:
        return enum_members(info, classes, values=True)
    pairs = literal(node)
    if isinstance(pairs, (list, tuple)):
        return [str(p[0]) for p in pairs if isinstance(p, (list, tuple)) and p] or None
    return None


def django_fields(info, classes):
    fields = {}
    for stmt in info.node.body:
        if not (isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name)):
            continue
        call = stmt.value
        callee = name_of(call) if isinstance(call, ast.Call) else None
        if not callee or not (callee.endswith("Field") or callee in RELATIONS) or callee == "ManyToManyField":
            continue  # ponytail: ManyToMany join tables are not listed
        attr = stmt.targets[0].id
        type_ = callee
        if callee in RELATIONS and call.args:
            type_ = "%s(%s)" % (callee, ast.unparse(call.args[0]).strip("'\""))
        fields[attr] = column(
            django_field_name(attr, call), type_,
            bool(kw_literal(call, "null", False)),
            bool(kw_literal(call, "unique", False)) or callee == "OneToOneField" or bool(kw_literal(call, "primary_key", False)),
            bool(kw_literal(call, "primary_key", False)),
            django_choices(call, classes),
        )
    return fields


def django_uniques(info, fields):
    to_column = lambda f: fields[f]["name"] if f in fields else f
    out = []
    together = literal(info.meta.get("unique_together"), ())
    if together and all(isinstance(x, str) for x in together):
        together = (together,)
    for group in together or ():
        out.append([to_column(f) for f in group])
    constraints = info.meta.get("constraints")
    for item in constraints.elts if isinstance(constraints, (ast.List, ast.Tuple)) else []:
        if isinstance(item, ast.Call) and name_of(item) == "UniqueConstraint":
            cols = kw_literal(item, "fields")
            if isinstance(cols, (list, tuple)):
                out.append([to_column(f) for f in cols])
    return out


def read_django(classes):
    tables = []
    is_model = lambda i: inherits(i, classes, {"Model"})
    abstract = lambda i: literal(i.meta.get("abstract")) is True
    for info in list(classes.values()):
        if not is_model(info) or abstract(info) or literal(info.meta.get("proxy")) is True:
            continue
        fields, concrete_parent = {}, None
        for part in chain(info, classes)[:-1]:
            if not is_model(part):
                continue
            if abstract(part):
                fields.update(django_fields(part, classes))
            else:
                concrete_parent = part  # multi-table inheritance: parent columns stay in the parent table
                fields = {}
        fields.update(django_fields(info, classes))

        cols = list(fields.values())
        if not any(c["primary"] for c in cols):
            if concrete_parent:
                pk = column(concrete_parent.name.lower() + "_ptr_id", "OneToOneField(%s)" % concrete_parent.name, False, True, True)
            else:
                # ponytail: assumes DEFAULT_AUTO_FIELD = BigAutoField (startproject default since 3.2).
                pk = column("id", "BigAutoField", False, True, True)
            cols.insert(0, pk)

        db_table = literal(info.meta.get("db_table"))
        label = app_label(info)
        name = db_table if isinstance(db_table, str) else ("%s_%s" % (label, info.name.lower()) if label else info.name.lower())
        tables.append(table(name, info.name, info.path, info.node.lineno, cols, django_uniques(info, fields)))
    return tables


def main():
    payload = json.load(sys.stdin)
    diagnostics = []
    classes, modules = collect(payload["files"], diagnostics)
    orm = payload["orm"]
    if orm == "django":
        tables = read_django(classes)
    else:
        tables = read_sqlalchemy(classes, modules, sqlmodel=orm == "sqlmodel")
    json.dump({"tables": tables, "diagnostics": diagnostics}, sys.stdout)


main()
