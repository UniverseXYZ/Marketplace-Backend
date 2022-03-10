import { AppConfig } from '../configuration/configuration.service';
import { Cron, CronExpression } from '@nestjs/schedule';

import CoinGecko from 'coingecko-api';
import { Injectable } from '@nestjs/common';
import { DEV_TOKEN_ADDRESSES, PROD_TOKEN_ADDRESSES, TOKENS } from './tokens';

@Injectable()
export class CoingeckoService {
  private coingeckoClient = null;

  public tokenUsdValues: { [key in TOKENS]: number } = {
    [TOKENS.ETH]: 0,
    [TOKENS.DAI]: 0,
    [TOKENS.USDC]: 0,
    [TOKENS.XYZ]: 0,
    [TOKENS.WETH]: 0,
  };

  public tokenAddresses: { [key in TOKENS]: string } = {
    [TOKENS.ETH]: '',
    [TOKENS.DAI]: '',
    [TOKENS.USDC]: '',
    [TOKENS.XYZ]: '',
    [TOKENS.WETH]: '',
  };

  constructor(private readonly config: AppConfig) {
    const client = new CoinGecko();
    this.coingeckoClient = client;

    this.tokenAddresses =
      config.values.ETHEREUM_CHAIN_ID === '1'
        ? PROD_TOKEN_ADDRESSES
        : DEV_TOKEN_ADDRESSES;

    this.updatePrices();
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  private async updatePrices() {
    const [eth, dai, usdc, xyz, weth] = await Promise.all([
      this.coingeckoClient.coins.fetch(TOKENS.ETH),
      this.coingeckoClient.coins.fetch(TOKENS.DAI),
      this.coingeckoClient.coins.fetch(TOKENS.USDC),
      this.coingeckoClient.coins.fetch(TOKENS.XYZ),
      this.coingeckoClient.coins.fetch(TOKENS.WETH),
    ]);

    const coinsList = {
      [TOKENS.ETH]: eth.data.market_data?.current_price?.usd,
      [TOKENS.DAI]: dai.data.market_data?.current_price?.usd,
      [TOKENS.USDC]: usdc.data.market_data?.current_price?.usd,
      [TOKENS.XYZ]: xyz.data.market_data?.current_price?.usd,
      [TOKENS.WETH]: weth.data.market_data?.current_price?.usd,
    };

    this.tokenUsdValues = coinsList;
  }
}
