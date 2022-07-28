export const constants = {
  REGEX_ETHEREUM_ADDRESS: /^0x[a-fA-F0-9]{40}$/,
  REGEX_JS_INSENSITIVE: /^[^%&<>;=\+\*\'\"\0\\]*$/, //allows JS non-sensitive characters
  REGEX_TOKEN_ID: /^[0-9]+$/,

  ZERO_ADDRESS: '0x0000000000000000000000000000000000000000',
  DATA_TYPE_0X: '0x',
  ORDER_DATA: 'ORDER_DATA',
  ZERO_UUID: '00000000-0000-0000-0000-000000000000',
  MAX_LISTING_TIMESTAMP: 2587683600, // January 01, 2052, 1am

  ORDER_TYPES: ['UNIVERSE_V1'],

  OFFSET_LIMIT: 100, // max number of items per page (for pagination)
  DEFAULT_LIMIT: 12, // default number of items per page (for pagination)

  GENERIC_ERROR: 'We had an error processing your request.',
  INVALID_SIGNATURE_ERROR: 'Invalid signature.',
  INVALID_ORDER_TYPE_ERROR: 'Invalid order type.',
  INVALID_SELL_ORDER_ASSET_ERROR: 'Invalid sell order asset.',
  WALLET_ADDRESS_ERROR: 'Please provide a valid wallet address.',
  TOKEN_ID_ERROR: 'Please provide a valid token id.',
  FORBIDDEN_CHARACTERS_ERROR: 'Forbidden characters.',
  INVALID_SALT_ERROR: 'Invalid salt for the order.',
  INVALID_CONTRACT_ADDRESS: 'Invalid contract address.',
  INVALID_ORDER_SIDE: 'Invalid order side.',
  INVALID_ORDER_STATUS: 'Invalid order status.',
  INVALID_ORDER_ACTIVITY: 'Invalid order activity.',
  INVALID_TOKEN_ID: 'Invalid token id.',
  INVALID_ASSET_CLASS: 'Invalid asset class.',
  CANNOT_EXECUTE_ORDER: 'Cannot execute this order.',
  NFT_ALLOWANCE_ERROR:
    'Some NFTs are not approved to be transferred or not owned by maker.',
  ORDER_ALREADY_EXISTS:
    'NFT is already listed or has been scheduled for listing.',
  ERC1155_INSUFFICIENT_BALANCE:
    'Insufficient ERC1155 balance. Cancel other listings or add editions to your wallet.',
  ERC1155_INCORRECT_AMOUNT: 'Cannot match ERC1155 order with specified amount.',
};
