import { AppConfig } from '../configuration/configuration.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
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
import { lastValueFrom, map } from 'rxjs';

const COINGECKO_ENDPOINT = 'https://api.coingecko.com/api/v3/coins';
@Injectable()
export class CoingeckoService {
  private logger;

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
    private readonly httpService: HttpService,
    @InjectModel(TokenPrices.name)
    readonly tokensModel: Model<TokenPricesDocument>,
  ) {
    this.logger = new Logger(this.constructor.name);

    this.tokenAddresses =
      config.values.ETHEREUM_CHAIN_ID === '1'
        ? PROD_TOKEN_ADDRESSES
        : DEV_TOKEN_ADDRESSES;

    this.updatePrices();
  }
  private fetchCoinData = async (url: string) => {
    const observable = await this.httpService
      .get(url)
      .pipe(map((res) => res.data));

    const data = await lastValueFrom(observable);
    return data;
  };
  @Cron(CronExpression.EVERY_MINUTE)
  protected async updatePrices() {
    try {
      const [eth, dai, usdc, xyz, weth]: any = await Promise.all([
        this.fetchCoinData(`${COINGECKO_ENDPOINT}/${TOKENS.ETH}`),
        this.fetchCoinData(`${COINGECKO_ENDPOINT}/${TOKENS.DAI}`),
        this.fetchCoinData(`${COINGECKO_ENDPOINT}/${TOKENS.USDC}`),
        this.fetchCoinData(`${COINGECKO_ENDPOINT}/${TOKENS.XYZ}`),
        this.fetchCoinData(`${COINGECKO_ENDPOINT}/${TOKENS.WETH}`),
      ]);
      const coinsList = {
        [TOKENS.ETH]: eth.market_data?.current_price?.usd,
        [TOKENS.DAI]: dai.market_data?.current_price?.usd,
        [TOKENS.USDC]: usdc.market_data?.current_price?.usd,
        [TOKENS.XYZ]: xyz.market_data?.current_price?.usd,
        [TOKENS.WETH]: weth.market_data?.current_price?.usd,
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
      this.logger.log('Updated token prices successfully!');
    } catch (e) {
      this.logger.error('Could not update USD quotes for ERC20 tokens: ' + e);
      return;
    }
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
