module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define("User", {
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    role: DataTypes.ENUM("admin", "user"),
    tenantId: { type: DataTypes.INTEGER, unique: "tenant_handle", field: "tenant_id" },
    handle: { type: DataTypes.STRING, unique: "tenant_handle" },
  }, { paranoid: true });
  return User;
};
