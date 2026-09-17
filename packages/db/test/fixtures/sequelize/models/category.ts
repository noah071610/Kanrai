import { DataTypes, Model } from "sequelize";
import { sequelize } from "../db";

export class Category extends Model {}
Category.init(
  { code: { type: DataTypes.STRING, primaryKey: true }, name: DataTypes.STRING },
  { sequelize, tableName: "category", timestamps: false },
);
