import { airnowPoller } from './airnow';
import { firmsPoller } from './firms';
import { nifcPoller } from './nifc';
import { nwsAlertsPoller } from './nws-alerts';
import { nwsWeatherPoller } from './nws-weather';
import { usgsPoller } from './usgs';
import type { Poller } from './types';

export const pollers: Poller[] = [usgsPoller, nwsAlertsPoller, nwsWeatherPoller, firmsPoller, nifcPoller, airnowPoller];

export type { Poller, PollerContext, PollerResult } from './types';
