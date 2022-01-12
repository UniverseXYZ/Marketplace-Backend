import { registerAs } from '@nestjs/config';
import R from 'ramda';
import { getAppSettings, getSecrets } from '../../utils/config';

const appsettings = getAppSettings('appsettings');
const secrets = getSecrets('secrets');

export const configValues = R.mergeDeepRight(
  R.mergeDeepRight(appsettings, secrets),
  process.env,
);

export default registerAs('config', () => {
  return configValues;
});
