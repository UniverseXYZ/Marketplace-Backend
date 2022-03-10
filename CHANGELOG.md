# [1.5.0](https://github.com/UniverseXYZ/Marketplace-Backend/compare/v1.4.2...v1.5.0) (2022-03-10)


### Features

* **orders:** Add filter for many tokenIds ([4b4ea5c](https://github.com/UniverseXYZ/Marketplace-Backend/commit/4b4ea5cc34125ce90f162d54e7812ea50bf88e47))

## [1.4.2](https://github.com/UniverseXYZ/Marketplace-Backend/compare/v1.4.1...v1.4.2) (2022-03-10)


### Bug Fixes

* **order:** query filters ([9b40715](https://github.com/UniverseXYZ/Marketplace-Backend/commit/9b407152f5f2be25b761c603f4de10dbed5dabd9))
* **queries:** fix has offers and token query ([f601b48](https://github.com/UniverseXYZ/Marketplace-Backend/commit/f601b483b8806b9fab5981946da3dab6c0fccf6c))
* **queries:** fix token and last offer queries ([89501af](https://github.com/UniverseXYZ/Marketplace-Backend/commit/89501af60d303c5bfdfe728c8e98002b75132273))

## [1.4.1](https://github.com/UniverseXYZ/Marketplace-Backend/compare/v1.4.0...v1.4.1) (2022-03-09)


### Bug Fixes

* **stale-orders:** improve stale orders querying ([267a96a](https://github.com/UniverseXYZ/Marketplace-Backend/commit/267a96a87ce5012a3fc6cc3fa4e8e5da2c0954d0))
* **stale-orders:** unnecesary-query ([9bcacc9](https://github.com/UniverseXYZ/Marketplace-Backend/commit/9bcacc91a2211e8e748bbb80c0f06ffe22f630d4))

# [1.4.0](https://github.com/UniverseXYZ/Marketplace-Backend/compare/v1.3.5...v1.4.0) (2022-03-08)


### Bug Fixes

* **erc20-query:** fix query to use token address ([85b7743](https://github.com/UniverseXYZ/Marketplace-Backend/commit/85b77437f9c750dff6df836e52b0be57e66dc36b))


### Features

* **history-endpoint:** introduce nft order history endpoint ([c75fbea](https://github.com/UniverseXYZ/Marketplace-Backend/commit/c75fbeac35c6c37157563bbd0e72ef80db6e7c45))

## [1.3.5](https://github.com/UniverseXYZ/Marketplace-Backend/compare/v1.3.4...v1.3.5) (2022-03-08)


### Bug Fixes

* **has-offers:** fix has offers query params to function properly ([aab51e1](https://github.com/UniverseXYZ/Marketplace-Backend/commit/aab51e1bce945182536b3319451747763b9b53db))
* **has-offers:** fix query in standrad endpoint ([1f877dc](https://github.com/UniverseXYZ/Marketplace-Backend/commit/1f877dce856195674f117f21a84be1742f7925db))

## [1.3.4](https://github.com/UniverseXYZ/Marketplace-Backend/compare/v1.3.3...v1.3.4) (2022-03-04)


### Bug Fixes

* **incorrect-placeholders:** fix incorrect placeholders causing the indexing to break ([7b16635](https://github.com/UniverseXYZ/Marketplace-Backend/commit/7b1663517ce2721c08a08bf620dd6a6fba34fe31))

## [1.3.3](https://github.com/UniverseXYZ/Marketplace-Backend/compare/v1.3.2...v1.3.3) (2022-03-03)


### Bug Fixes

* **utcTimestamp:** queries to use timestamp in seconds ([fa0bc0c](https://github.com/UniverseXYZ/Marketplace-Backend/commit/fa0bc0c2becab64c851c4750309d9b3a6e32c7c1))

## [1.3.2](https://github.com/UniverseXYZ/Marketplace-Backend/compare/v1.3.1...v1.3.2) (2022-03-01)


### Bug Fixes

* **regex:** fix tokenId regex ([7784f3e](https://github.com/UniverseXYZ/Marketplace-Backend/commit/7784f3e6d254b05084bd22bb45106d7d082be871))

## [1.3.1](https://github.com/UniverseXYZ/Marketplace-Backend/compare/v1.3.0...v1.3.1) (2022-03-01)


### Bug Fixes

* **orders:** Fix sell query ([dfad639](https://github.com/UniverseXYZ/Marketplace-Backend/commit/dfad63962e0dbe2ecb1cc304bc4dc7d8a8b1e75f))
* remove console log ([962fc4e](https://github.com/UniverseXYZ/Marketplace-Backend/commit/962fc4e4fc6ef5d86898ff30488c7147f753a803))

# [1.3.0](https://github.com/UniverseXYZ/Marketplace-Backend/compare/v1.2.1...v1.3.0) (2022-02-28)


### Bug Fixes

* **pr-comments:** use OrderStatus and OrderSide instead of numbers ([ac960ff](https://github.com/UniverseXYZ/Marketplace-Backend/commit/ac960fffc7fc5c9e56c1081d0c7515c4df8212ab))


### Features

* **floor-price-endpoint:** implement floor price endpoint ([2d5bf44](https://github.com/UniverseXYZ/Marketplace-Backend/commit/2d5bf4435579f68b2a02fbe3bcd77e4f97d20278))

## [1.2.1](https://github.com/UniverseXYZ/Marketplace-Backend/compare/v1.2.0...v1.2.1) (2022-02-28)


### Bug Fixes

* **log:** replace console.log with logger.log ([008597a](https://github.com/UniverseXYZ/Marketplace-Backend/commit/008597a6505d520d52dadfc42fba83dc196b661e))
* **pr-comments:** use OrderStatus enum and remove unnecessary await ([e59a255](https://github.com/UniverseXYZ/Marketplace-Backend/commit/e59a25598d3fa10e1535a02da5346b31f17265ed))

# [1.2.0](https://github.com/UniverseXYZ/Marketplace-Backend/compare/v1.1.1...v1.2.0) (2022-02-27)


### Features

* **card-offer:** add best and last nft offer endpoint ([7c78c28](https://github.com/UniverseXYZ/Marketplace-Backend/commit/7c78c28fda31a0170d4887a8b1919fb5bd673cb4))

## [1.1.1](https://github.com/UniverseXYZ/Marketplace-Backend/compare/v1.1.0...v1.1.1) (2022-02-24)


### Bug Fixes

* **has-offers:** fix has offers filter ([f252048](https://github.com/UniverseXYZ/Marketplace-Backend/commit/f252048bbacc6aa06c879aefeaf5b259c3cb767f))

# [1.1.0](https://github.com/UniverseXYZ/Marketplace-Backend/compare/v1.0.0...v1.1.0) (2022-02-22)


### Features

* **order-filters:** add additional filters ([205c5c0](https://github.com/UniverseXYZ/Marketplace-Backend/commit/205c5c0332b409b1d4a9b94d46bc193241438c77))
* **order-filters:** resolve filters issues ([cfdd83b](https://github.com/UniverseXYZ/Marketplace-Backend/commit/cfdd83b3e47d439227d920500b9ede273e874c0d))

# 1.0.0 (2021-12-19)


### Features

* to add http tests ([ed01263](https://github.com/UniverseXYZ/Marketplace-Backend/commit/ed0126371593e1ccb78a31db641427ab37c8e2dd))
