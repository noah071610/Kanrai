import { Column, Entity, Index, Unique } from "typeorm";
import { Base } from "./base";

export enum Role {
  Admin = "admin",
  User = "user",
}

@Entity()
@Unique(["tenant", "handle"])
export class UserProfile extends Base {
  @Column({ unique: true, name: "email_address" })
  email: string;

  @Column({ type: "enum", enum: Role, nullable: true })
  role: Role | null;

  @Column()
  handle: string;

  @Index({ unique: true })
  @Column("varchar", { length: 20 })
  tenant: string;

  @Column(() => Object)
  embedded: object;
}

@Entity("audit_log")
export class Audit {
  @PrimaryGeneratedColumn()
  id: number;
}
