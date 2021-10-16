import { registerAs } from '@nestjs/config';

export const configValues = {
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE_NAME,
  },
  app: {
    port: parseInt(process.env.APP_PORT, 10) || 8080,
    sessionSecret: process.env.SESSION_SECRET,
  },
};

export default registerAs('config', () => {
  return configValues;
});
