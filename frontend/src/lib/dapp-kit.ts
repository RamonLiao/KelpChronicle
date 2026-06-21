import { createDAppKit } from '@mysten/dapp-kit-react';
import { SuiGrpcClient } from '@mysten/sui/grpc';

const GRPC_URL: Record<string, string> = {
  testnet: 'https://fullnode.testnet.sui.io',
  mainnet: 'https://fullnode.mainnet.sui.io',
};

export const dappKit = createDAppKit({
  networks: ['testnet'] as const,
  defaultNetwork: 'testnet',
  createClient: (network) => new SuiGrpcClient({ network, baseUrl: GRPC_URL[network] ?? GRPC_URL.testnet }),
  autoConnect: true,
  storageKey: 'recall_dappkit',
});
