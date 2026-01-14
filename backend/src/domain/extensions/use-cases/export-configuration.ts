import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Not } from 'typeorm';
import { ConfigurationEntity, ConfigurationRepository, ConfigurationStatus } from 'src/domain/database';
import { ExplorerService } from '../services';
import { buildConfiguration, maskKeyValues } from './utils';

export class ExportConfiguration {
  constructor(public readonly id: number) {}
}

export interface ExportedConfiguration {
  name: string;
  description: string;
  enabled: boolean;
  agentName?: string;
  chatFooter?: string;
  chatSuggestions?: any[];
  executorEndpoint?: string;
  executorHeaders?: string;
  userGroupIds?: string[];
  extensions?: Array<{
    name: string;
    enabled: boolean;
    values: Record<string, any>;
    configurableArguments?: any;
  }>;
}

export class ExportConfigurationResponse {
  constructor(public readonly data: ExportedConfiguration) {}
}

@QueryHandler(ExportConfiguration)
export class ExportConfigurationHandler implements IQueryHandler<ExportConfiguration, ExportConfigurationResponse> {
  constructor(
    @InjectRepository(ConfigurationEntity)
    private readonly configurations: ConfigurationRepository,
    private readonly explorer: ExplorerService,
  ) {}

  async execute(request: ExportConfiguration): Promise<ExportConfigurationResponse> {
    const { id } = request;

    const entity = await this.configurations.findOne({
      where: { id, status: Not(ConfigurationStatus.DELETED) },
      relations: {
        extensions: true,
      },
    });

    if (!entity) {
      throw new NotFoundException(`Configuration with id ${id} was not found`);
    }

    // Build configuration with extensions
    const withExtensions = true;
    const onlyEnabledExtensions = false;
    const configuration = await buildConfiguration(entity, this.explorer, withExtensions, onlyEnabledExtensions);

    // Mask sensitive values
    if (configuration.extensions) {
      configuration.extensions.forEach((ext) => maskKeyValues(ext));
    }

    // Build export structure
    const exportData: ExportedConfiguration = {
      name: configuration.name,
      description: configuration.description,
      enabled: configuration.enabled,
      agentName: configuration.agentName,
      chatFooter: configuration.chatFooter,
      chatSuggestions: configuration.chatSuggestions,
      executorEndpoint: configuration.executorEndpoint,
      executorHeaders: configuration.executorHeaders,
      userGroupIds: configuration.userGroupIds,
      extensions: configuration.extensions?.map((ext) => ({
        name: ext.name,
        enabled: ext.enabled,
        values: ext.values,
        configurableArguments: ext.configurableArguments,
      })),
    };

    return new ExportConfigurationResponse(exportData);
  }
}
