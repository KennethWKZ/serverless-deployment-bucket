const DeploymentBucketPlugin = require('.')
const util = require('./util')

class Serverless {
  constructor() {
    this.version = '4.0.0'
    this.service = { service: 'my-service', provider: {}, custom: {} }
    this.processedInput = { commands: [] }
    this.providers = {}
  }

  setProvider(name, provider) {
    this.providers[name] = provider
  }
}

class AwsProvider {
  constructor() {
    this.getAwsSdkV3Config = jest.fn(() => ({}))
  }
}

class CLI {
  constructor() {
    this.log = jest.fn()
  }
}

describe('DeploymentBucketPlugin', () => {
  let plugin
  let serverless
  let options
  let deploymentBucketProp
  let sendMock

  beforeEach(() => {
    serverless = new Serverless()
    deploymentBucketProp = util.deploymentBucketProperty(serverless.version)
    serverless.service.service = 'my-service'
    options = {}
    serverless.setProvider('aws', new AwsProvider(serverless))
    serverless.cli = new CLI(serverless)
    sendMock = jest.fn()
  })

  const attachClient = (plugin) => {
    plugin._s3Client = { send: sendMock }
  }

  describe('constructor', () => {
    beforeEach(() => {
      plugin = new DeploymentBucketPlugin(serverless, options)
    })

    it('should set the provider to instance of AwsProvider', () => {
      expect(plugin.provider).toBeInstanceOf(AwsProvider)
    })

    it('should have access to the serverless instance', () => {
      expect(plugin.serverless).toEqual(serverless)
    })
  })

  describe('without configuration', () => {
    it('should default to empty deploymentBucket config if missing provider deploymentBucketObject', () => {
      serverless.service.provider[deploymentBucketProp] = undefined
      plugin = new DeploymentBucketPlugin(serverless, options)

      expect(plugin.deploymentBucket).toEqual({})
    })

    it('should default to empty config if missing object "custom"', () => {
      serverless.service.custom = undefined
      plugin = new DeploymentBucketPlugin(serverless, options)

      expect(plugin.config).toEqual({})
    })

    it('should default to empty config if missing object "custom.deploymentBucket"', () => {
      serverless.service.custom = {}
      plugin = new DeploymentBucketPlugin(serverless, options)

      expect(plugin.config).toEqual({})
    })

    it('should default to empty config if null object "custom.deploymentBucket"', () => {
      serverless.service.custom = {
        deploymentBucket: null
      }
      plugin = new DeploymentBucketPlugin(serverless, options)

      expect(plugin.config).toEqual({})
    })

    it('should default versioning to false if missing property "custom.deploymentBucket.versioning"', () => {
      serverless.service.provider[deploymentBucketProp] = {
        name: 'some-bucket'
      }
      serverless.service.custom = {
        deploymentBucket: {}
      }
      plugin = new DeploymentBucketPlugin(serverless, options)

      expect(plugin.config.versioning).toEqual(false)
    })

    it('should default acceleration to false if missing property "custom.deploymentBucket.acceleration"', () => {
      serverless.service.provider[deploymentBucketProp] = {
        name: 'some-bucket'
      }
      serverless.service.custom = {
        deploymentBucket: {}
      }
      plugin = new DeploymentBucketPlugin(serverless, options)

      expect(plugin.config.accelerate).toEqual(false)
    })

    it('should default access logging to false if missing property "custom.deploymentBucket.accessLog"', () => {
      serverless.service.provider[deploymentBucketProp] = {
        name: 'some-bucket'
      }
      serverless.service.custom = {
        deploymentBucket: {}
      }
      plugin = new DeploymentBucketPlugin(serverless, options)

      expect(plugin.config.accessLog).toEqual(false)
    })

    it('should not set hooks if missing property "custom.deploymentBucket.name"', () => {
      serverless.service.provider[deploymentBucketProp] = {}
      plugin = new DeploymentBucketPlugin(serverless, options)

      expect(plugin.hooks).not.toHaveProperty('before:aws:common:validate:validate')
    })

    it('should not set hooks if empty property "custom.deploymentBucket.name"', () => {
      serverless.service.provider[deploymentBucketProp] = {
        name: ''
      }
      plugin = new DeploymentBucketPlugin(serverless, options)

      expect(plugin.hooks).not.toHaveProperty('before:aws:common:validate:validate')
    })
  })

  describe('with configuration enabled = false', () => {
    beforeEach(() => {
      serverless.service.provider[deploymentBucketProp] = {
        name: 'some-bucket',
        serverSideEncryption: 'AES256'
      }
      serverless.service.custom = {
        deploymentBucket: {
          enabled: false
        }
      }
      plugin = new DeploymentBucketPlugin(serverless, options)
    })

    it('should not set hooks', () => {
      expect(plugin.hooks).toEqual({})
    })
  })

  describe('with AES256 configuration', () => {
    beforeEach(() => {
      serverless.service.provider[deploymentBucketProp] = {
        name: 'some-bucket',
        serverSideEncryption: 'AES256'
      }
      plugin = new DeploymentBucketPlugin(serverless, options)
    })

    it('should set config', () => {
      expect(plugin.config).toBeTruthy()
    })

    it('should set hooks', () => {
      expect(plugin.hooks).toHaveProperty('before:aws:common:validate:validate')
    })
  })

  describe('with KMS configuration', () => {
    beforeEach(() => {
      serverless.service.provider[deploymentBucketProp] = {
        name: 'some-bucket',
        serverSideEncryption: 'aws:kms',
        kmsKeyID: 'some-key-id'
      }
      plugin = new DeploymentBucketPlugin(serverless, options)
    })

    it('should set config', () => {
      expect(plugin.config).toBeTruthy()
    })

    it('should set hooks', () => {
      expect(plugin.hooks).toHaveProperty('before:aws:common:validate:validate')
    })
  })

  describe('when serverless package', () => {
    it('should not set hooks serverless package command is run', () => {
      serverless.service.provider[deploymentBucketProp] = {
        name: 'random-bucket'
      }
      serverless.processedInput = { commands: ['package'] }
      plugin = new DeploymentBucketPlugin(serverless, options)

      expect(plugin.hooks).not.toHaveProperty('before:aws:common:validate:validate')
    })

    it('should set hooks serverless deploy command is run', () => {
      serverless.service.provider[deploymentBucketProp] = {
        name: 'random-bucket'
      }
      serverless.processedInput = { commands: ['deploy'] }
      plugin = new DeploymentBucketPlugin(serverless, options)

      expect(plugin.hooks).toHaveProperty('before:aws:common:validate:validate')
    })
  })

  describe('applyDeploymentBucket()', () => {
    beforeEach(() => {
      serverless.service.provider[deploymentBucketProp] = {
        name: 'some-bucket',
        serverSideEncryption: 'AES256'
      }
      serverless.service.custom = {
        deploymentBucket: {
          versioning: true,
          accelerate: true
        }
      }

      plugin = new DeploymentBucketPlugin(serverless, options)
      attachClient(plugin)
    })

    it('should log info when using existing deployment bucket', async () => {
      sendMock.mockResolvedValueOnce({}) // HeadBucket

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Using deployment bucket'))
    })

    it('should log info when creating new deployment bucket', async () => {
      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Creating deployment bucket'))
    })

    it('should log info when SSE is applied to deployment bucket', async () => {
      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket
      sendMock.mockRejectedValueOnce({}) // GetBucketEncryption

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Applied SSE'))
    })

    it('should log info when versioning is applied to deployment bucket', async () => {
      sendMock.mockResolvedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({
        Status: 'Suspended'
      }) // GetBucketVersioning

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Enabled versioning'))
    })

    it('should suspend versioning when versioning is not already suspended on deployment bucket', async () => {
      plugin.config.versioning = false
      sendMock.mockResolvedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({
        Status: 'Enabled'
      }) // GetBucketVersioning

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Suspended versioning'))
    })

    it('should log info when acceleration is applied to deployment bucket', async () => {
      sendMock.mockResolvedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({
        Status: 'Enabled'
      }) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({
        Status: 'Suspended'
      }) // GetBucketAccelerateConfiguration

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Enabled acceleration'))
    })

    it('should suspend acceleration when acceleration is not already suspended on deployment bucket', async () => {
      plugin.config.accelerate = false
      sendMock.mockResolvedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({
        Status: 'Enabled'
      }) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({
        Status: 'Enabled'
      }) // GetBucketAccelerateConfiguration

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Suspended acceleration'))
    })

    it('should log error when exception caught', async () => {
      const spy = jest.spyOn(console, 'error')
      const errorMessage = 'Some AWS provider error'
      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockRejectedValueOnce(new Error(errorMessage)) // CreateBucket

      await plugin.applyDeploymentBucket()

      expect(spy).toHaveBeenLastCalledWith(expect.stringContaining(errorMessage))
    })

    it('should not enable versioning when versioning is already enabled on deployment bucket', async () => {
      sendMock.mockResolvedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({
        Status: 'Enabled'
      }) // GetBucketVersioning

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).not.toHaveBeenCalledWith(expect.stringContaining('Enabled versioning'))
    })

    it('should not enable acceleration when acceleration is already enabled on deployment bucket', async () => {
      sendMock.mockResolvedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({
        Status: 'Enabled'
      }) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({
        Status: 'Enabled'
      }) // GetBucketAccelerateConfiguration

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).not.toHaveBeenCalledWith(expect.stringContaining('Enabled acceleration'))
    })

    it('should apply SSE (AES256) if configured on provider', async () => {
      plugin.deploymentBucket.serverSideEncryption = 'AES256'
      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket
      sendMock.mockRejectedValueOnce({}) // GetBucketEncryption

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Applied SSE (AES256)'))
    })

    it('should apply SSE (KMS) if configured on provider', async () => {
      plugin.deploymentBucket.serverSideEncryption = 'aws:kms'
      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket
      sendMock.mockRejectedValueOnce({}) // GetBucketEncryption

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Applied SSE (aws:kms)'))
    })

    it('should not apply SSE if not configured on provider', async () => {
      plugin.deploymentBucket.serverSideEncryption = undefined
      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket
      sendMock.mockRejectedValueOnce({}) // GetBucketEncryption

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).not.toHaveBeenCalledWith(expect.stringContaining('Applied SSE'))
    })

    it('should not apply bucket policy if not configured', async () => {
      plugin.config.policy = undefined
      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket
      sendMock.mockRejectedValueOnce({}) // GetBucketEncryption

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).not.toHaveBeenCalledWith(expect.stringContaining('Applied deployment bucket policy'))
    })

    it('should apply bucket policy if configured', async () => {
      plugin.config.policy = '{}'
      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket
      sendMock.mockRejectedValueOnce({}) // GetBucketEncryption

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Applied deployment bucket policy'))
    })

    it('should not apply bucket tags if not configured and getBucketTagging() throws exception', async () => {
      plugin.config = {
        ...plugin.config,
        accelerate: false,
        versioning: false,
        policy: undefined,
        tags: undefined
      }

      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({}) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({}) // GetBucketAccelerateConfiguration
      sendMock.mockRejectedValueOnce({}) // GetBucketTagging

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).not.toHaveBeenCalledWith(expect.stringContaining('Updated deployment bucket tags'))
    })

    it('should apply bucket tags if configured', async () => {
      plugin.config = {
        ...plugin.config,
        accelerate: false,
        versioning: false,
        policy: undefined,
        tags: [ { Key: 'Environment', Value: 'testing' } ]
      }

      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({}) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({}) // GetBucketAccelerateConfiguration
      sendMock.mockResolvedValueOnce({}) // PutBucketTagging

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Updated deployment bucket tags'))
    })

    it('should apply bucket tags when getBucketTagging() throws exception', async () => {
      plugin.config = {
        ...plugin.config,
        accelerate: false,
        versioning: false,
        policy: undefined,
        tags: [ { Key: 'Environment', Value: 'testing' } ],
      }

      sendMock.mockResolvedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({}) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({}) // GetBucketAccelerateConfiguration
      sendMock.mockRejectedValueOnce({}) // GetBucketTagging

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Updated deployment bucket tags'))
    })

    it('should not apply bucket tags if no change', async () => {
      plugin.config = {
        ...plugin.config,
        accelerate: false,
        versioning: false,
        policy: undefined,
        tags: [ { Key: 'Environment', Value: 'testing' } ]
      }

      sendMock.mockResolvedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({}) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({}) // GetBucketAccelerateConfiguration
      sendMock.mockResolvedValueOnce({
        TagSet: [ { Key: 'Environment', Value: 'testing' } ]
      }) // GetBucketTagging

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).not.toHaveBeenCalledWith(expect.stringContaining('Updated deployment bucket tags'))
    })

    it('should remove bucket tags if not configured', async () => {
      plugin.config = {
        ...plugin.config,
        accelerate: false,
        versioning: false,
        policy: undefined,
        tags: undefined,
      }

      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({}) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({}) // GetBucketAccelerateConfiguration
      sendMock.mockResolvedValueOnce({
        TagSet: [ { Key: 'Environment', Value: 'testing' } ]
      }) // GetBucketTagging
      sendMock.mockResolvedValueOnce({}) // DeleteBucketTagging

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Updated deployment bucket tags'))
    })

    it('should not apply bucket public access block if not configured and getPublicAccessBlock() throws exception', async () => {
      plugin.config = {
        ...plugin.config,
        accelerate: false,
        versioning: false,
        policy: undefined,
        tags: undefined,
        blockPublicAccess: undefined
      }

      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({}) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({}) // GetBucketAccelerateConfiguration
      sendMock.mockResolvedValueOnce({}) // GetBucketTagging
      sendMock.mockRejectedValueOnce({}) // GetPublicAccessBlock

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).not.toHaveBeenCalledWith(expect.stringContaining('Updated deployment bucket public access block'))
    })

    it('should apply bucket public access block if configured', async () => {
      plugin.config = {
        ...plugin.config,
        accelerate: false,
        versioning: false,
        policy: undefined,
        tags: undefined,
        blockPublicAccess: true,
      }

      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({}) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({}) // GetBucketAccelerateConfiguration
      sendMock.mockResolvedValueOnce({}) // GetBucketTagging
      sendMock.mockResolvedValueOnce({}) // GetPublicAccessBlock
      sendMock.mockResolvedValueOnce({}) // PutPublicAccessBlock

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Updated deployment bucket public access block'))
    })

    it('should apply bucket public access block when getPublicAccessBlock() throws exception', async () => {
      plugin.config = {
        ...plugin.config,
        accelerate: false,
        versioning: false,
        policy: undefined,
        tags: undefined,
        blockPublicAccess: true,
      }

      sendMock.mockResolvedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({}) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({}) // GetBucketAccelerateConfiguration
      sendMock.mockResolvedValueOnce({}) // GetBucketTagging
      sendMock.mockRejectedValueOnce({}) // GetPublicAccessBlock

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Updated deployment bucket public access block'))
    })

    it('should not apply bucket public access block if no change', async () => {
      plugin.config = {
        ...plugin.config,
        accelerate: false,
        versioning: false,
        policy: undefined,
        tags: undefined,
        blockPublicAccess: true
      }

      sendMock.mockResolvedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({}) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({}) // GetBucketTagging
      sendMock.mockResolvedValueOnce({}) // GetBucketAccelerateConfiguration
      sendMock.mockResolvedValueOnce({
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true
        }
      }) // GetPublicAccessBlock

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).not.toHaveBeenCalledWith(expect.stringContaining('Updated deployment bucket public access block'))
    })

    it('should remove bucket public access block if not configured', async () => {
      plugin.config = {
        ...plugin.config,
        accelerate: false,
        versioning: false,
        policy: undefined,
        tags: undefined,
        blockPublicAccess: undefined
      }

      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({}) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({}) // GetBucketAccelerateConfiguration
      sendMock.mockResolvedValueOnce({}) // GetBucketTagging
      sendMock.mockResolvedValueOnce({
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true
        }
      }) // GetPublicAccessBlock
      sendMock.mockResolvedValueOnce({}) // DeletePublicAccessBlock

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Updated deployment bucket public access block'))
    })

    it('should apply bucket public access on new buckets', async () => {
      plugin.config = {
        ...plugin.config,
        accelerate: false,
        versioning: false,
        policy: undefined,
        tags: undefined,
        blockPublicAccess: true
      }

      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({}) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({}) // GetBucketAccelerateConfiguration
      sendMock.mockResolvedValueOnce({}) // GetBucketTagging
      sendMock.mockResolvedValueOnce({}) // PutPublicAccessBlock

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Updated deployment bucket public access block'))
    })

    it('should remove bucket public access on new buckets', async () => {
      plugin.config = {
        ...plugin.config,
        accelerate: false,
        versioning: false,
        policy: undefined,
        tags: undefined,
        blockPublicAccess: false
      }

      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({}) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({}) // GetBucketAccelerateConfiguration
      sendMock.mockResolvedValueOnce({}) // GetBucketTagging
      sendMock.mockResolvedValueOnce({}) // DeletePublicAccessBlock

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Updated deployment bucket public access block'))
    })

    it('should log info about addition when access logging is applied to deployment bucket', async () => {
      plugin.config = {
        ...plugin.config,
        accelerate: false,
        versioning: false,
        policy: undefined,
        tags: undefined,
        blockPublicAccess: false,
        accessLog: true
      }

      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({}) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({}) // GetBucketAccelerateConfiguration
      sendMock.mockResolvedValueOnce({}) // GetBucketTagging
      sendMock.mockResolvedValueOnce({}) // DeletePublicAccessBlock
      sendMock.mockResolvedValueOnce({LoggingEnabled: false}) // GetBucketLogging
      sendMock.mockResolvedValueOnce() // PutBucketLogging

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Enabled access logging on deployment bucket'))
    })

    it('should log info about removal when access logging is applied to deployment bucket', async () => {
      plugin.config = {
        ...plugin.config,
        accelerate: false,
        versioning: false,
        policy: undefined,
        tags: undefined,
        blockPublicAccess: false,
        accessLog: false
      }

      sendMock.mockRejectedValueOnce({}) // HeadBucket
      sendMock.mockResolvedValueOnce({}) // CreateBucket
      sendMock.mockResolvedValueOnce({}) // GetBucketEncryption
      sendMock.mockResolvedValueOnce({}) // GetBucketVersioning
      sendMock.mockResolvedValueOnce({}) // GetBucketAccelerateConfiguration
      sendMock.mockResolvedValueOnce({}) // GetBucketTagging
      sendMock.mockResolvedValueOnce({}) // DeletePublicAccessBlock
      sendMock.mockResolvedValueOnce({ LoggingEnabled: { TargetBucket:'Bucket' }}) // GetBucketLogging

      await plugin.applyDeploymentBucket()

      expect(plugin.serverless.cli.log).toHaveBeenCalledWith(expect.stringContaining('Suspended access logging on deployment bucket'))
    })
  })
})
