'use strict'

const util = require('./util')
const {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  GetBucketEncryptionCommand,
  PutBucketEncryptionCommand,
  GetBucketVersioningCommand,
  PutBucketVersioningCommand,
  GetBucketLoggingCommand,
  PutBucketLoggingCommand,
  GetBucketAccelerateConfigurationCommand,
  PutBucketAccelerateConfigurationCommand,
  PutBucketPolicyCommand,
  GetBucketTaggingCommand,
  PutBucketTaggingCommand,
  DeleteBucketTaggingCommand,
  GetPublicAccessBlockCommand,
  PutPublicAccessBlockCommand,
  DeletePublicAccessBlockCommand,
} = require('@aws-sdk/client-s3')

const get = (obj, path, defaultValue) => {
  return path.split('.').filter(Boolean).every(step => !(step && !(obj = obj[step]))) ? obj : defaultValue
}

const getPublicAccessBlock = block => block === true
  ? { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true }
  : { BlockPublicAcls: false, BlockPublicPolicy: false, IgnorePublicAcls: false, RestrictPublicBuckets: false }

class DeploymentBucketPlugin {
  constructor(serverless, options) {
    this.serverless = serverless
    this.provider = this.serverless.providers.aws
    this._s3Client = null

    const deploymentBucketProp = util.deploymentBucketProperty(this.serverless.version)
    this.deploymentBucket = get(this.serverless.service, `provider.${deploymentBucketProp}`, {})

    this.config = get(this.serverless.service, 'custom.deploymentBucket', {})

    this.hooks = {}

    if (this.config.enabled !== undefined && this.config.enabled === false) {
      return;
    }

    if (this.deploymentBucket.name) {
      this.config.versioning = get(this.config, 'versioning', false)
      this.config.accessLog = get(this.config, 'accessLog', false)
      this.config.accelerate = get(this.config, 'accelerate', false)
      this.config.policy = get(this.config, 'policy', undefined)
      this.config.tags = util.filterValidBucketTags(get(this.config, 'tags', undefined))
      this.config.blockPublicAccess = get(this.config, 'blockPublicAccess', undefined)

      const serverlessCommand = get(this.serverless, 'processedInput.commands', [])
      if (!serverlessCommand.includes('package')) {
        this.hooks['before:aws:common:validate:validate'] = this.applyDeploymentBucket.bind(this)
      }
    }
  }

  // osls v4 / serverless v4: build SDK v3 client from provider config.
  getClient() {
    if (!this._s3Client) {
      this._s3Client = new S3Client(this.provider.getAwsSdkV3Config())
    }
    return this._s3Client
  }

  async bucketExists(name) {
    try {
      await this.getClient().send(new HeadBucketCommand({ Bucket: name }))
      return true
    } catch (e) {
      return false
    }
  }

  async createBucket(name) {
    return await this.getClient().send(new CreateBucketCommand({
      Bucket: name,
      ACL: 'private',
    }))
  }

  async hasBucketEncryption(name) {
    try {
      await this.getClient().send(new GetBucketEncryptionCommand({ Bucket: name }))
      return true
    } catch (e) {
      return false
    }
  }

  async putBucketEncryption(name, sseAlgorithm, kmsMasterKeyId) {
    return await this.getClient().send(new PutBucketEncryptionCommand({
      Bucket: name,
      ServerSideEncryptionConfiguration: {
        Rules: [
          {
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm: sseAlgorithm,
              KMSMasterKeyID: kmsMasterKeyId
            }
          }
        ]
      }
    }))
  }

  async hasBucketVersioning(name) {
    try {
      const response = await this.getClient().send(new GetBucketVersioningCommand({ Bucket: name }))
      if (response.Status && response.Status == 'Enabled') {
        return true
      }

      return false
    } catch (e) {
      return false
    }
  }

  async shouldUpdateBucketAccessLogging (name, config) {
    try {
      const response = await this.getClient().send(new GetBucketLoggingCommand({ Bucket: name }))
      const loggingEnabledAndMatches = response.LoggingEnabled
        && config && config.bucket === response.LoggingEnabled.TargetBucket
        && config.prefix === response.LoggingEnabled.TargetPrefix

      return !(loggingEnabledAndMatches || (!response.LoggingEnabled && !config));
    } catch (e) {
      this.serverless.cli.log('Failed to get bucket logging configuration', e)
      return false;
    }
  }

  async putBucketVersioning(name, status) {
    return await this.getClient().send(new PutBucketVersioningCommand({
      Bucket: name,
      VersioningConfiguration: {
        Status: status ? 'Enabled' : 'Suspended'
      }
    }))
  }

  async putBucketAccessLogging (name, { bucket, prefix }) {
    const params = bucket ? {
      Bucket: name,
      BucketLoggingStatus: {
        LoggingEnabled: {
          TargetBucket: bucket,
          TargetPrefix: prefix
        }
      }
    } : {
      Bucket: name,
      BucketLoggingStatus: {}
    }
    try {
      return await this.getClient().send(new PutBucketLoggingCommand(params))
    } catch (e) {
      this.serverless.cli.log('Failed to put bucket logging configuration', e)
      return false
    }

  }

  async hasBucketAcceleration (name) {
    try {
      const response = await this.getClient().send(new GetBucketAccelerateConfigurationCommand({ Bucket: name }))
      if (response.Status && response.Status == 'Enabled') {
        return true
      }

      return false
    } catch (e) {
      return false
    }
  }

  async putBucketAcceleration(name, status) {
    return await this.getClient().send(new PutBucketAccelerateConfigurationCommand({
      Bucket: name,
      AccelerateConfiguration: {
        Status: status ? 'Enabled' : 'Suspended'
      }
    }))
  }

  async putBucketPolicy(name, policy) {
    return await this.getClient().send(new PutBucketPolicyCommand({
      Bucket: name,
      Policy: JSON.stringify(policy),
    }))
  }

  async hasChangedBucketTags(name, tags) {
    try {
      const response = await this.getClient().send(new GetBucketTaggingCommand({ Bucket: name }))
      return response && JSON.stringify(response.TagSet) !== JSON.stringify(tags)
    } catch (e) {
      return Boolean(tags)
    }
  }

  async updateBucketTags(name, tags) {
    if (Array.isArray(tags) && tags.length) {
      return await this.getClient().send(new PutBucketTaggingCommand({
        Bucket: name,
        Tagging: { TagSet: tags }
      }))
    } else {
      return await this.getClient().send(new DeleteBucketTaggingCommand({
        Bucket: name
      }))
    }
  }

  async hasChangedPublicAccessBlock(name, blockPublicAccess) {
    try {
      const config = getPublicAccessBlock(blockPublicAccess)
      const response = await this.getClient().send(new GetPublicAccessBlockCommand({ Bucket: name }))
      return response && JSON.stringify(response.PublicAccessBlockConfiguration) !== JSON.stringify(config)
    } catch (e) {
      return blockPublicAccess
    }
  }

  async updatePublicAccessBlock(name, blockPublicAccess) {
    if (blockPublicAccess === true) {
      return await this.getClient().send(new PutPublicAccessBlockCommand({
        Bucket: name,
        PublicAccessBlockConfiguration: getPublicAccessBlock(blockPublicAccess)
      }))
    } else {
      return await this.getClient().send(new DeletePublicAccessBlockCommand({
        Bucket: name
      }))
    }
  }

  async applyDeploymentBucket() {
    if (this.applied) {
      return
    }
    this.applied = true

    try {
      let isNewBucket = false

      if (await this.bucketExists(this.deploymentBucket.name)) {
        this.serverless.cli.log(`Using deployment bucket '${this.deploymentBucket.name}'`)
      } else {
        this.serverless.cli.log(`Creating deployment bucket '${this.deploymentBucket.name}'...`)

        await this.createBucket(this.deploymentBucket.name)
        isNewBucket = true
      }

      if (this.deploymentBucket.serverSideEncryption) {
        if (!(await this.hasBucketEncryption(this.deploymentBucket.name))) {
          if (this.deploymentBucket.serverSideEncryption === "aws:kms") {
            await this.putBucketEncryption(this.deploymentBucket.name, this.deploymentBucket.serverSideEncryption, this.deploymentBucket.kmsKeyID)
          }

          if (this.deploymentBucket.serverSideEncryption === "AES256") {
            await this.putBucketEncryption(this.deploymentBucket.name, this.deploymentBucket.serverSideEncryption)
          }

          this.serverless.cli.log(`Applied SSE (${this.deploymentBucket.serverSideEncryption}) to deployment bucket`)
        }
      }

      if ((await this.hasBucketVersioning(this.deploymentBucket.name)) != this.config.versioning) {
        await this.putBucketVersioning(this.deploymentBucket.name, this.config.versioning)

        if (this.config.versioning) {
          this.serverless.cli.log('Enabled versioning on deployment bucket')
        } else {
          this.serverless.cli.log('Suspended versioning on deployment bucket')
        }
      }

      if ((await this.hasBucketAcceleration(this.deploymentBucket.name)) != this.config.accelerate) {
        await this.putBucketAcceleration(this.deploymentBucket.name, this.config.accelerate)

        if (this.config.accelerate) {
          this.serverless.cli.log('Enabled acceleration on deployment bucket')
        } else {
          this.serverless.cli.log('Suspended acceleration on deployment bucket')
        }
      }

      if (this.config.policy) {
        await this.putBucketPolicy(this.deploymentBucket.name, this.config.policy)
        this.serverless.cli.log(`Applied deployment bucket policy`)
      }

      const hasChangedBucketTags = (isNewBucket && Array.isArray(this.config.tags) && this.config.tags.length) ||
        (await this.hasChangedBucketTags(this.deploymentBucket.name, this.config.tags));
      if (hasChangedBucketTags) {
        await this.updateBucketTags(this.deploymentBucket.name, this.config.tags)
        this.serverless.cli.log('Updated deployment bucket tags')
      }

      const hasChangedPublicAccessBlock = (isNewBucket && typeof this.config.blockPublicAccess === 'boolean') ||
        (await this.hasChangedPublicAccessBlock(this.deploymentBucket.name, this.config.blockPublicAccess));
      if (hasChangedPublicAccessBlock) {
        await this.updatePublicAccessBlock(this.deploymentBucket.name, this.config.blockPublicAccess)
        this.serverless.cli.log('Updated deployment bucket public access block')
      }

      if ((await this.shouldUpdateBucketAccessLogging(this.deploymentBucket.name, this.config.accessLog))) {
        await this.putBucketAccessLogging(this.deploymentBucket.name, this.config.accessLog)

        if (this.config.accessLog) {
          this.serverless.cli.log('Enabled access logging on deployment bucket')
        } else {
          this.serverless.cli.log('Suspended access logging on deployment bucket')
        }
      }

    } catch (e) {
      console.error(`\n-------- Deployment Bucket Error --------\n${e.message}`)
    }
  }
}

module.exports = DeploymentBucketPlugin
