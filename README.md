# Marcketplace Backend API

## Description

This is the backend of UniverseXYZ marcketplace. It will handle Order Creation, Encode and Transaction Creation.

# Endpoints

##### `GET` `/v1/orders`

###### Find and return orders

#### Params:

`page`: Valid positive integer
`limit`: Valid positive integer
`maker`: ETH address of the creator
`side`: `0` for buy orders, `1` for sell orders
`status`: Number in 0-4 range
- `0` - CREATED
- `1` - PARTIALFILLED
- `2` - FILLED
- `3` - CANCELLED
- `4` - STALE
Can be combined like status=1,2,3
Default is `0`.

`activity`: Order activity in 0-4 range
- `0` - ACTIVE
- `1` - INACTIVE
- `2` - FUTURE
- `3` - PASSED
- `4` - ALL
Default is `0`.

`assetClass`: `ERC721` or `ERC721_BUNDLE`

`collection`: ETH address of the collection

`tokenIds`: Token ids of the NFTs. 
Example: tokenIds=1,2,3

`beforeTimestamp`: Order timestamp like 1645177895

`token`: ERC20 token. 
Example: USDC

`minPrice`: Min price of the order

`maxPrice`: Max price of the order

`sortBy`: Integer 
- `1` - Recently listed
- `2` - Highest Price
- `3` - Lowest Price
- `8` - TokenId ascending
- `9` - TokenId descending

`hasOffers`: `True` or `False`

##### `GET` `/v1/orders/card/{collectionAddress}/{tokenId}`
Get info about a given token from a collection.
#### Params:

`collection`: ETH address of the collection
`tokenId`: Id of the token

##### `GET` `/v1/orders/browse`
Filter and return active sell orders.
#### Params:

`page`: Valid positive integer
`limit`: Valid positive integer
`maker`: ETH address of the creator
Default is `0`.

`assetClass`: `ERC721` or `ERC721_BUNDLE`

`collection`: ETH address of the collection

`tokenIds`: Token ids of the NFTs. 
Example: tokenIds=1,2,3

`beforeTimestamp`: Order timestamp like 1645177895

`token`: ERC20 token. 
Example: USDC

`minPrice`: Min price of the order

`maxPrice`: Max price of the order

`sortBy`: Integer 
- `1` - Recently listed
- `2` - Highest Price
- `3` - Lowest Price
- `8` - TokenId ascending
- `9` - TokenId descending

`hasOffers`: `True` or `False`

##### `GET` `/v1/orders/listing/{collectionAddress}/{tokenId}`
Find active sell order for a specific NFT
#### Params:

`collectionAddress`: ETH address
`tokenId`: Valid positive integer

##### `GET` `/v1/orders/listing/{collectionAddress}/{tokenId}/history`
Get order history for a specific NFT
#### Params:

`collectionAddress`: ETH address
`tokenId`: Valid positive integer

##### `GET` `/v1/orders/collection/{collectionAddress}`
Get floor price and volume traded for a collection
#### Params:

`collectionAddress`: ETH address

##### `GET` `/v1/orders/{hash}`
Get order data by hash.

##### `POST` `/v1/orders/order`
Create an order.

#### Example:


```
{
  "type": "UNIVERSE_V1",
  "maker": "0xE1d7a59AB392EA29b059dAE31c5A573e2fEcC5A8",
  "make": {
    "assetType": {
      "assetClass": "ERC721",
      "contract": "0x78c3E13fdDC49f89feEB54C3FC47d7df611FA9BE",
      "tokenId": "6837465522200555559822",
      "bundleName": "Optional. Max length 100. Bundle name for ERC721_BUNDLE orders.",
      "bundleDescription": "Optional. Max length 1024. Bundle description for ERC721_BUNDLE orders."
    },
    "value": "1"
  },
  "taker": "0x0000000000000000000000000000000000000000",
  "take": {
    "assetType": {
      "assetClass": "ETH"
    },
    "value": "100000000000000000"
  },
  "salt": 1,
  "start": 0,
  "end": 0,
  "data": {
    "dataType": "ORDER_DATA",
    "revenueSplits": [
      {
        "account": "0x3bB0dE46c6B1501aF5921Fb7EDBc15dFD998Fadd",
        "value": "5000"
      }
    ]
  },
  "signature": "0xad47f02925ffbd0bbc6a53846b0f499ca74ec8a176e4e1420eb1dcbb21d05a3d1e3f20957f2f7f8c99586e9ed92d2aeb2c85ea54afd39b49c4a1d20bd639d2e41c"
}
```

##### `POST` `/v1/orders/{hash}/prepare`
Generate and prepare match transaction.

#### Example:

```
{
  "maker": "0x67b93857317462775666a310ac292D61dEE4bbb9",
  "amount": "1",
  "revenueSplits": [
    {
      "account": "0x3bB0dE46c6B1501aF5921Fb7EDBc15dFD998Fadd",
      "value": "5000"
    }
  ]
}
```

##### `POST` `/v1/orders/endoder/order`
Encode and prepare order for signing.

#### Example:

```
{
  "type": "UNIVERSE_V1",
  "maker": "0xE1d7a59AB392EA29b059dAE31c5A573e2fEcC5A8",
  "make": {
    "assetType": {
      "assetClass": "ERC721",
      "contract": "0x78c3E13fdDC49f89feEB54C3FC47d7df611FA9BE",
      "tokenId": "6837465522200555559822",
      "bundleName": "Optional. Max length 100. Bundle name for ERC721_BUNDLE orders.",
      "bundleDescription": "Optional. Max length 1024. Bundle description for ERC721_BUNDLE orders."
    },
    "value": "1"
  },
  "taker": "0x0000000000000000000000000000000000000000",
  "take": {
    "assetType": {
      "assetClass": "ETH"
    },
    "value": "100000000000000000"
  },
  "salt": 1,
  "start": 0,
  "end": 0,
  "data": {
    "dataType": "ORDER_DATA",
    "revenueSplits": [
      {
        "account": "0x3bB0dE46c6B1501aF5921Fb7EDBc15dFD998Fadd",
        "value": "5000"
      }
    ]
  },
  "signature": "0xad47f02925ffbd0bbc6a53846b0f499ca74ec8a176e4e1420eb1dcbb21d05a3d1e3f20957f2f7f8c99586e9ed92d2aeb2c85ea54afd39b49c4a1d20bd639d2e41c"
}
```

##### `GET` `/v1/orders/salt/{walletAddress}`
Get salt for a wallet address.

#### Params:

`walletAddress`: ETH address

-----------------------------

### *INTERNAL ENDPOINTS* ###

##### `PUT` `/internal/orders/match`
Mark orders as matched. Intended to be used by the marketplace-indexer
https://github.com/UniverseXYZ/Marketplace-Indexer

#### Example:
```
{
  "events": [
    {
      "txHash": "0xf6768c7be3133edf019685bc230e2a4e58b505d159508e87cfcdac8e0e017b99",
      "leftMaker": "0xf3d5a5d72b0c5c68e75ce70836f23a9337643098",
      "rightMaker": "0x0ad21d5df91ec3f60086c08e07bd0f8cd95486a4",
      "leftOrderHash": "0xb562669668f03d229620e0c46378266a6d8c252b32d00bbdfffb5b6b14fae903",
      "rightOrderHash": "0xc25980c3b862b0221fcf62484ce805ec22a95a6e42c4aeb3e119ee08225cbd36",
      "newLeftFill": "100000000000000000",
      "newRightFill": "1",
      "txFrom": "0x0ad21d5df91ec3f60086c08e07bd0f8cd95486a4"
    }
  ]
}
```

##### `PUT` `/internal/orders/cancel`
Mark orders as cancelled. Intended to be used by the marketplace-indexer
https://github.com/UniverseXYZ/Marketplace-Indexer

#### Example:
```
{
  "events": [
    {
      "txHash": "0xf6768c7be3133edf019685bc230e2a4e58b505d159508e87cfcdac8e0e017b99",
      "leftMaker": "0xf3d5a5d72b0c5c68e75ce70836f23a9337643098",
      "leftOrderHash": "0xb562669668f03d229620e0c46378266a6d8c252b32d00bbdfffb5b6b14fae903"
    }
  ]
}
```

##### `PUT` `/internal/orders/track`
Stale orders Intended to be used by the marketplace-indexer
https://github.com/UniverseXYZ/Marketplace-Indexer

#### Example:

```
{
  blockNum: string;
  hash: string;
  fromAddress: string;
  toAddress: string;
  value: string;
  erc721TokenId: string;
  erc1155Metadata: array;
  asset: string;
  category: string;
  address: string;
}
```

-------------

# ADDITIONAL ENDPOINTS

##### `GET` `/v1/tokenPrices`
Get the current token prices.

##### `GET` `/v1/tokenPrices/{token}`
Get the current prices for a specific token.



-------

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## License

TBD


