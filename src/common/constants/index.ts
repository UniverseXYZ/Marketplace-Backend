
export const constants = {

    REGEX_ETHEREUM_ADDRESS: /^0x[a-fA-F0-9]{40}$/,
    REGEX_JS_INSENSITIVE: /^[^%&<>;=\+\*\'\"\0\\]*$/, //allows JS non-sensitive characters


    ZERO_ADDRESS: '0x0000000000000000000000000000000000000000',
    DATA_TYPE_0X: '0x',
    ORDER_DATA: 'ORDER_DATA',
    
    ORDER_TYPES: [
        'UNIVERSE_V1',
    ],


    GENERIC_ERROR: 'We had an error processing your request.',
    INVALID_SIGNATURE_ERROR: 'Invalid signature.',
    INVALID_ORDER_TYPE_ERROR: 'Invalid order type.',
    INVALID_SELL_ORDER_ASSET_ERROR: 'Invalid sell order asset.',
    WALLET_ADDRESS_ERROR: 'Please provide a valid wallet address.',
    INVALID_SALT_ERROR: 'Invalid salt for the order.',
    ORDER_ALREADY_FILLED_ERROR: 'Order has been filled.',
    NFT_ALLOWANCE_ERROR: 'Some NFTs are not approved to be transferred or not awned by maker.',

};