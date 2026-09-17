import { AllowNull, Column, DataType, Model, Table, Unique } from "sequelize-typescript";

@Table({ freezeTableName: true })
export class Tag extends Model {
  @AllowNull(false)
  @Unique
  @Column(DataType.STRING)
  label: string;

  @Column
  weight: number;
}
