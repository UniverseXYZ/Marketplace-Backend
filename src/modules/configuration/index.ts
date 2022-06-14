import { registerAs } from '@nestjs/config';
// import { config } from 'dotenv';
// config();

export const configValues = process.env;

export default registerAs('config', () => {
  return configValues;
});
