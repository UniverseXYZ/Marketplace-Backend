import { TOKENS, TOKEN_DECIMALS } from '../coingecko/tokens';

export const addPriceSortQuery = (
  tokenAddresses: { [key in TOKENS]: string },
  tokenUsdValues: { [key in TOKENS]: number },
) => {
  return `(case 
    when take->'assetType'->>'assetClass' = 'ETH' 
    then CAST(take->>'value' as DECIMAL) / POWER(10,${
      TOKEN_DECIMALS[TOKENS.ETH]
    }) * ${tokenUsdValues[TOKENS.ETH]}

    when LOWER(take->'assetType'->>'contract') = '${tokenAddresses[
      TOKENS.DAI
    ].toLowerCase()}' 
    then CAST(take->>'value' as DECIMAL) / POWER(10,${
      TOKEN_DECIMALS[TOKENS.DAI]
    }) * ${tokenUsdValues[TOKENS.DAI]} 

    when LOWER(take->'assetType'->>'contract') = '${tokenAddresses[
      TOKENS.USDC
    ].toLowerCase()}' 
    then CAST(take->>'value' as DECIMAL) / POWER(10,${
      TOKEN_DECIMALS[TOKENS.USDC]
    }) * ${tokenUsdValues[TOKENS.USDC]} 

    when LOWER(take->'assetType'->>'contract') = '${tokenAddresses[
      TOKENS.WETH
    ].toLowerCase()}' 
    then CAST(take->>'value' as DECIMAL) / POWER(10,${
      TOKEN_DECIMALS[TOKENS.WETH]
    }) * ${tokenUsdValues[TOKENS.WETH]} 

    when LOWER(take->'assetType'->>'contract') = '${tokenAddresses[
      TOKENS.XYZ
    ].toLowerCase()}' 
    then CAST(take->>'value' as DECIMAL) / POWER(10,${
      TOKEN_DECIMALS[TOKENS.XYZ]
    }) * ${tokenUsdValues[TOKENS.XYZ]}
    
    end)`;
};
