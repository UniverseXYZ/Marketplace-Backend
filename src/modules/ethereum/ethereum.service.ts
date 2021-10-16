import { Injectable } from '@nestjs/common';
import { AppConfig } from '../configuration/configuration.service';

@Injectable()
export class EthereumService {
  public provider;

  //TODO: setup the eth provider for Rinkeby and Mainnet
  constructor(private config: AppConfig) {}
}
