
export const nftContractABI = [
  {
    inputs: [
    {
      internalType: 'uint256',
      name: 'tokenId',
      type: 'uint256',
    }
    ],
    outputs: [
    {
      // internalType: '',
      name: 'getApproved',
      type: 'address',
    }
    ],
    name: 'getApproved',
    type: 'function',
    stateMutability: 'view',
  },
  {
    inputs: [
    {
      internalType: 'address',
      name: 'owner',
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
  },
  {
    inputs: [
    {
      internalType: 'uint256',
      name: 'tokenId',
      type: 'uint256',
    }
    ],
    outputs: [
    {
      // internalType: '',
      name: 'ownerOf',
      type: 'address',
    }
    ],
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
  }
] as any;