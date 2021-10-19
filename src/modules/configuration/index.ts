import { registerAs } from '@nestjs/config';
import R from 'ramda';
import appsetings from '../../../appsetings/appsettings.json';
import secrets from '../../../secrets/secrets.json';

export const configValues = R.mergeDeepRight(appsetings, secrets);

export default registerAs('config', () => {
  return configValues;
});
