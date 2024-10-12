import mysql, { PoolOptions } from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config({ path: "./config.env" });

const options: PoolOptions = {
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT || "3306"),
  user: process.env.MYSQL_USERNAME,
  password: process.env.MYSQL_USER_PASSWORD,
  database: process.env.MYSQL_DB_NAME,
};

export const dbConnection = mysql.createPool(options);
