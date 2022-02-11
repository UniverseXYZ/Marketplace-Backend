
export const erc1155ContractABI = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'id',
        type: 'uint256',
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
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'operator',
        type: 'address',
      }
    ],
    outputs: [
      {
        // internalType: '',
        name: 'isApprovedForAll',
        type: 'bool',
      }
    ],
    name: 'isApprovedForAll',
    type: 'function',
    stateMutability: 'view',
  }
] as any;