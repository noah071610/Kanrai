import { CreateDateColumn, PrimaryGeneratedColumn } from "typeorm";

export abstract class Base {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @CreateDateColumn()
  createdAt: Date;
}
