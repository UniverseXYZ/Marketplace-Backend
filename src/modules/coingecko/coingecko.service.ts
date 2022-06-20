import { AppConfig } from '../configuration/configuration.service';
import { Cron, CronExpression } from '@nestjs/schedule';

import CoinGecko from 'coingecko-api';
import { Injectable, Logger } from '@nestjs/common';
import {
  DEV_TOKEN_ADDRESSES,
  PROD_TOKEN_ADDRESSES,
  TOKENS,
  TOKEN_SYMBOLS,
} from './tokens.config';
import { TokenPricesDocument, TokenPrices } from './schema/token-prices.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateTokenPriceDTO } from './create-token-price.dto';

@Injectable()
export class CoingeckoService {
  private logger;
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

  constructor(
    private readonly config: AppConfig,
    @InjectModel(TokenPrices.name)
    readonly tokensModel: Model<TokenPricesDocument>,
  ) {
    this.logger = new Logger(this.constructor.name);
    const client = new CoinGecko();
    this.coingeckoClient = client;

    this.tokenAddresses =
      config.values.ETHEREUM_CHAIN_ID === '1'
        ? PROD_TOKEN_ADDRESSES
        : DEV_TOKEN_ADDRESSES;

    this.updatePrices();
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  protected async updatePrices() {
    const [eth, dai, usdc, xyz, weth]: any = await Promise.all([
      this.coingeckoClient.coins.fetch(TOKENS.ETH),
      this.coingeckoClient.coins.fetch(TOKENS.DAI),
      this.coingeckoClient.coins.fetch(TOKENS.USDC),
      this.coingeckoClient.coins.fetch(TOKENS.XYZ),
      this.coingeckoClient.coins.fetch(TOKENS.WETH),
    ]).catch((e) => {
      this.logger.error('Could not update USD quotes for ERC20 tokens: ' + e);
      return;
    });

    const coinsList = {
      [TOKENS.ETH]: eth.data.market_data?.current_price?.usd,
      [TOKENS.DAI]: dai.data.market_data?.current_price?.usd,
      [TOKENS.USDC]: usdc.data.market_data?.current_price?.usd,
      [TOKENS.XYZ]: xyz.data.market_data?.current_price?.usd,
      [TOKENS.WETH]: weth.data.market_data?.current_price?.usd,
    };

    for (const token in coinsList) {
      if (coinsList.hasOwnProperty(token)) {
        const priceInUsd = coinsList[token];

        if (token) {
          const newTokenData: CreateTokenPriceDTO = {
            symbol: TOKEN_SYMBOLS[token],
            usd: priceInUsd,
            name: token,
          };
          const savedToken = await this.queryByName(token);
          await this.upsertTokenById(savedToken, newTokenData);
        }
      }
    }

    this.tokenUsdValues = coinsList;
  }

  public async upsertTokenById(document: any, tokenData: CreateTokenPriceDTO) {
    if (document) {
      return await this.tokensModel.updateOne({ _id: document._id }, tokenData);
    }
    return await this.tokensModel.create(tokenData);
  }

  public async queryByName(token: string) {
    return await this.tokensModel.findOne({
      name: token,
    });
  }

  public async queryAll() {
    return await this.tokensModel.find({});
  }
}
