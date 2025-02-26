import type {
  DwnRpc,
  VcResponse,
  DidResponse,
  DwnResponse,
  SyncManager,
  AppDataStore,
  SendVcRequest,
  SendDidRequest,
  SendDwnRequest,
  ProcessVcRequest,
  Web5ManagedAgent,
  ProcessDwnRequest,
  ProcessDidRequest,
} from '@web5/agent';

import { LevelStore } from '@web5/common';
import { EdDsaAlgorithm } from '@web5/crypto';
import { DidIonMethod, DidKeyMethod, DidResolver } from '@web5/dids';
import {
  LocalKms,
  DidManager,
  DwnManager,
  KeyManager,
  DidStoreDwn,
  KeyStoreDwn,
  AppDataVault,
  Web5RpcClient,
  IdentityManager,
  IdentityStoreDwn,
  SyncManagerLevel,
  PrivateKeyStoreDwn,
  cryptoToPortableKeyPair,
} from '@web5/agent';

export type IdentityAgentOptions = {
  agentDid: string;
  appData: AppDataStore;
  didManager: DidManager;
  didResolver: DidResolver;
  dwnManager: DwnManager;
  identityManager: IdentityManager;
  keyManager: KeyManager;
  rpcClient: DwnRpc;
  syncManager: SyncManager;
}

export class IdentityAgent implements Web5ManagedAgent {
  agentDid: string;
  appData: AppDataStore;
  didManager: DidManager;
  didResolver: DidResolver;
  dwnManager: DwnManager;
  identityManager: IdentityManager;
  keyManager: KeyManager;
  rpcClient: DwnRpc;
  syncManager: SyncManager;

  constructor(options: IdentityAgentOptions) {
    this.agentDid = options.agentDid;
    this.appData = options.appData;
    this.didManager = options.didManager;
    this.didResolver = options.didResolver;
    this.dwnManager = options.dwnManager;
    this.identityManager = options.identityManager;
    this.keyManager = options.keyManager;
    this.rpcClient = options.rpcClient;
    this.syncManager = options.syncManager;

    // Set this agent to be the default agent.
    this.didManager.agent = this;
    this.dwnManager.agent = this;
    this.identityManager.agent = this;
    this.keyManager.agent = this;
    this.syncManager.agent = this;
  }

  static async create(options: Partial<IdentityAgentOptions> = {}): Promise<IdentityAgent> {
    let {
      agentDid, appData, didManager, didResolver, dwnManager,
      identityManager, keyManager, rpcClient, syncManager
    } = options;

    if (agentDid === undefined) {
      // An Agent DID was not specified, so set to empty string.
      agentDid = '';
    }

    if (appData === undefined) {
      // A custom AppDataStore implementation was not specified, so
      // instantiate a LevelDB backed secure AppDataVault.
      appData = new AppDataVault({
        store: new LevelStore('data/agent/vault')
      });
    }

    if (didManager === undefined) {
      // A custom DidManager implementation was not specified, so
      // instantiate a default with in-memory store.
      didManager = new DidManager({
        didMethods : [DidIonMethod, DidKeyMethod],
        store      : new DidStoreDwn()
      });
    }

    if (didResolver === undefined) {
      // A custom DidManager implementation was not specified, so
      // instantiate a default with in-memory store.
      didResolver = new DidResolver({ didResolvers: [DidIonMethod, DidKeyMethod] });
    }

    if (dwnManager === undefined) {
      // A custom DwnManager implementation was not specified, so
      // instantiate a default.
      dwnManager = await DwnManager.create({ didResolver });
    }

    if (identityManager === undefined) {
      // A custom IdentityManager implementation was not specified, so
      // instantiate a default that uses a DWN store.
      identityManager = new IdentityManager({
        store: new IdentityStoreDwn()
      });
    }

    if (keyManager === undefined) {
      // A custom KeyManager implementation was not specified, so
      // instantiate a default with KMSs.
      const localKmsDwn = new LocalKms({
        kmsName         : 'local',
        keyStore        : new KeyStoreDwn({ schema: 'https://identity.foundation/schemas/web5/kms-key' }),
        privateKeyStore : new PrivateKeyStoreDwn()
      });
      const localKmsMemory = new LocalKms({
        kmsName: 'memory'
      });
      keyManager = new KeyManager({
        kms: {
          local  : localKmsDwn,
          memory : localKmsMemory
        },
        store: new KeyStoreDwn({ schema: 'https://identity.foundation/schemas/web5/managed-key' })
      });
    }

    if (rpcClient === undefined) {
      // A custom RPC Client implementation was not specified, so
      // instantiate a default.
      rpcClient = new Web5RpcClient();
    }

    if (syncManager === undefined) {
      // A custom SyncManager implementation was not specified, so
      // instantiate a LevelDB-backed default.
      syncManager = new SyncManagerLevel();
    }

    // Instantiate the Identity Agent.
    const agent = new IdentityAgent({
      agentDid,
      appData,
      didManager,
      didResolver,
      dwnManager,
      identityManager,
      keyManager,
      rpcClient,
      syncManager
    });

    return agent;
  }

  async firstLaunch(): Promise<boolean> {
    // Check whether data vault is already initialized.
    const { initialized } = await this.appData.getStatus();
    return initialized === false;
  }

  /**
   * Executed once the first time the Identity Agent is launched.
   * The passphrase should be input by the end-user.
   * */
  async initialize(options: { passphrase: string }) {
    const { passphrase } = options;

    // Generate an Ed25519 key pair for the Identity Agent.
    const agentKeyPair = await new EdDsaAlgorithm().generateKey({
      algorithm   : { name: 'EdDSA', namedCurve: 'Ed25519' },
      extractable : true,
      keyUsages   : ['sign', 'verify']
    });

    /** Initialize the AppDataStore with the Identity Agent's
     * private key and passphrase, which also unlocks the data vault. */
    await this.appData.initialize({
      passphrase : passphrase,
      keyPair    : agentKeyPair,
    });
  }

  async processDidRequest(_request: ProcessDidRequest): Promise<DidResponse> {
    throw new Error('Not implemented');
  }

  async processDwnRequest(request: ProcessDwnRequest): Promise<DwnResponse> {
    return this.dwnManager.processRequest(request);
  }

  async processVcRequest(_request: ProcessVcRequest): Promise<VcResponse> {
    throw new Error('Not implemented');
  }

  async sendDidRequest(_request: SendDidRequest): Promise<DidResponse> {
    throw new Error('Not implemented');
  }

  async sendDwnRequest(request: SendDwnRequest): Promise<DwnResponse> {
    return this.dwnManager.sendRequest(request);
  }

  async sendVcRequest(_request: SendVcRequest): Promise<VcResponse> {
    throw new Error('Not implemented');
  }

  async start(options: { passphrase: string }) {
    const { passphrase } = options;

    if (await this.firstLaunch()) {
      // 1A. Agent's first launch so initialize.
      await this.initialize({ passphrase });
    } else {
      // 1B. Agent was previously initialized.
      // Unlock the data vault and cache the vault unlock key (VUK) in memory.
      await this.appData.unlock({ passphrase });
    }

    // 2. Set the Identity Agent's root did:key identifier.
    this.agentDid = await this.appData.getDid();

    // 3. Import the Identity Agent's signing key pair to KeyManager.
    const defaultSigningKey = cryptoToPortableKeyPair({
      cryptoKeyPair: {
        privateKey : await this.appData.getPrivateKey(),
        publicKey  : await this.appData.getPublicKey()
      },
      keyData: {
        alias : await this.didManager.getDefaultSigningKey({ did: this.agentDid }),
        kms   : 'memory'
      }
    });
    await this.keyManager.setDefaultSigningKey({ key: defaultSigningKey });
  }
}