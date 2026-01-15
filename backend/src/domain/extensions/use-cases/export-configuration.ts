import { Logger, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Not } from 'typeorm';
import { ConfigurationEntity, ConfigurationRepository, ConfigurationStatus } from 'src/domain/database';
import { ChatSuggestion } from 'src/domain/shared';
import { ExtensionObjectArgument } from '../interfaces';
import { ExplorerService } from '../services';
import { buildConfiguration, maskKeyValues } from './utils';

export class ExportConfiguration {
  constructor(public readonly id: number) {}
}

export interface ExportedConfiguration {
  version?: string;
  exportedAt?: string;
  name: string;
  description: string;
  enabled: boolean;
  agentName?: string;
  chatFooter?: string;
  chatSuggestions?: ChatSuggestion[];
  executorEndpoint?: string;
  executorHeaders?: string;
  userGroupIds?: string[];
  extensions?: Array<{
    name: string;
    enabled: boolean;
    values: Record<string, any>;
    configurableArguments?: ExtensionObjectArgument;
  }>;
}

export class ExportConfigurationResponse {
  constructor(public readonly data: ExportedConfiguration) {}
}

@QueryHandler(ExportConfiguration)
export class ExportConfigurationHandler implements IQueryHandler<ExportConfiguration, ExportConfigurationResponse> {
  private readonly logger = new Logger(ExportConfigurationHandler.name);

  constructor(
    @InjectRepository(ConfigurationEntity)
    private readonly configurations: ConfigurationRepository,
    private readonly explorer: ExplorerService,
  ) {}

  async execute(request: ExportConfiguration): Promise<ExportConfigurationResponse> {
    const { id } = request;

    try {
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

      // Get version from environment variable
      const version = process.env.VERSION || '0.0.0';

      // Build export structure
      const exportData: ExportedConfiguration = {
        version,
        exportedAt: new Date().toISOString(),
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
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Failed to export configuration ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
