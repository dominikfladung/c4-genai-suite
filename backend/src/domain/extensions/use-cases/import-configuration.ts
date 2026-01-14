import { BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In } from 'typeorm';
import {
  ConfigurationEntity,
  ConfigurationRepository,
  ConfigurationStatus,
  ExtensionEntity,
  ExtensionRepository,
  UserGroupEntity,
  UserGroupRepository,
} from 'src/domain/database';
import { assignDefined } from 'src/lib';
import { ConfigurationModel } from '../interfaces';
import { ExplorerService } from '../services';
import { buildConfiguration, unmaskExtensionValues, validateConfiguration } from './utils';
import { ExportedConfiguration } from './export-configuration';

export class ImportConfiguration {
  constructor(public readonly data: ExportedConfiguration) {}
}

export class ImportConfigurationResponse {
  constructor(public readonly configuration: ConfigurationModel) {}
}

@CommandHandler(ImportConfiguration)
export class ImportConfigurationHandler implements ICommandHandler<ImportConfiguration, ImportConfigurationResponse> {
  constructor(
    @InjectRepository(ConfigurationEntity)
    private readonly configurations: ConfigurationRepository,
    @InjectRepository(ExtensionEntity)
    private readonly extensionsRepo: ExtensionRepository,
    @InjectRepository(UserGroupEntity)
    private readonly userGroups: UserGroupRepository,
    private readonly explorer: ExplorerService,
  ) {}

  async execute(command: ImportConfiguration): Promise<ImportConfigurationResponse> {
    const { data } = command;

    // Validate required fields
    if (!data.name) {
      throw new BadRequestException('Configuration name is required');
    }

    // Create configuration entity
    const entity = this.configurations.create();

    // Handle user groups
    if (data.userGroupIds && data.userGroupIds.length > 0) {
      entity.userGroups = await this.userGroups.findBy({ id: In(data.userGroupIds) });
    }

    // Assign configuration fields
    assignDefined(entity, {
      name: data.name,
      description: data.description || '',
      status: data.enabled ? ConfigurationStatus.ENABLED : ConfigurationStatus.DISABLED,
      agentName: data.agentName,
      chatFooter: data.chatFooter,
      chatSuggestions: data.chatSuggestions,
      executorEndpoint: data.executorEndpoint,
      executorHeaders: data.executorHeaders,
    });

    // Handle extensions
    if (data.extensions && data.extensions.length > 0) {
      entity.extensions = [];

      for (const extData of data.extensions) {
        // Verify extension exists in the system
        const extensionDefinition = this.explorer.getExtension(extData.name);
        if (!extensionDefinition) {
          throw new BadRequestException(`Extension '${extData.name}' is not available in this system`);
        }

        // Unmask and validate extension values
        const unmaskedValues = unmaskExtensionValues({ ...extData.values });
        try {
          validateConfiguration(unmaskedValues, extensionDefinition.spec);
        } catch (err) {
          const error = err as Error;
          throw new BadRequestException(`Invalid configuration for extension '${extData.name}': ${error.message}`);
        }

        // Create extension entity
        const extensionEntity = this.extensionsRepo.create();
        assignDefined(extensionEntity, {
          name: extData.name,
          enabled: extData.enabled ?? false,
          values: unmaskedValues,
          configurableArguments: extData.configurableArguments,
          externalId: '', // Will be set by the system
        });

        entity.extensions.push(extensionEntity);
      }
    }

    // Save configuration
    const created = await this.configurations.save(entity);
    const result = await buildConfiguration(created);

    return new ImportConfigurationResponse(result);
  }
}
