
export const erc20ContractABI = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'owner',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'spender',
        type: 'address',
      }
    ],
    outputs: [
      {
        // internalType: '',
        name: 'allowance',
        type: 'uint256',
      }
    ],
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      }
    ],
    outputs: [
      {
        // internalType: '',
        name: 'balanceOf',
        type: 'uint256',
      }
    ],
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
  }
] as any;