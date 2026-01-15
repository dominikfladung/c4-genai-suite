import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  ConfigurationEntity,
  ConfigurationHistoryEntity,
  ConfigurationSnapshot,
  ConfigurationStatus,
  ExtensionEntity,
  ExtensionSnapshot,
} from 'src/domain/database';
import { ConfigurationHistoryRepository } from 'src/domain/database/repositories/configuration-history.repository';
import { ConfiguredExtension } from '../interfaces';
import { maskKeyValues } from '../use-cases/utils';
import { ExplorerService } from './explorer-service';

@Injectable()
export class ConfigurationHistoryService {
  private readonly logger = new Logger(ConfigurationHistoryService.name);

  constructor(
    @InjectRepository(ConfigurationHistoryEntity)
    private readonly historyRepository: ConfigurationHistoryRepository,
    @InjectRepository(ConfigurationEntity)
    private readonly configurationRepository: Repository<ConfigurationEntity>,
    private readonly dataSource: DataSource,
    private readonly explorerService: ExplorerService,
  ) {}

  /**
   * Create and save a snapshot of the current configuration state
   */
  async saveSnapshot(configurationId: number, userId: string, action: string, comment?: string): Promise<void> {
    const configuration = await this.configurationRepository.findOne({
      where: { id: configurationId },
      relations: ['extensions', 'userGroups'],
    });

    if (!configuration) {
      throw new NotFoundException(`Configuration ${configurationId} not found`);
    }

    const snapshot = this.buildSnapshot(configuration);
    await this.historyRepository.createSnapshot(configurationId, snapshot, userId, action, comment);
  }

  /**
   * Build a snapshot object from a configuration entity
   */
  private buildSnapshot(configuration: ConfigurationEntity): ConfigurationSnapshot {
    const extensions: ExtensionSnapshot[] = [];

    if (configuration.extensions) {
      for (const ext of configuration.extensions) {
        // Mask sensitive values
        const maskedValues = { ...ext.values };
        const extension = this.explorerService.getExtension(ext.name);
        if (extension) {
          // Create a properly typed ConfiguredExtension for maskKeyValues
          const tempConfigured: Partial<ConfiguredExtension> = {
            spec: extension.spec,
            values: maskedValues,
          };
          maskKeyValues(tempConfigured as ConfiguredExtension);
        }

        extensions.push({
          externalId: ext.externalId,
          name: ext.name,
          enabled: ext.enabled,
          values: maskedValues,
          state: ext.state || {},
          configurableArguments: ext.configurableArguments || {},
        });
      }
    }

    return {
      name: configuration.name,
      description: configuration.description,
      status: configuration.status as 'enabled' | 'disabled' | 'deleted',
      agentName: configuration.agentName,
      chatFooter: configuration.chatFooter,
      chatSuggestions: configuration.chatSuggestions,
      executorEndpoint: configuration.executorEndpoint,
      executorHeaders: configuration.executorHeaders,
      userGroupIds: configuration.userGroupIds || [],
      extensions,
    };
  }

  /**
   * Get all versions for a configuration
   */
  async getHistory(configurationId: number): Promise<ConfigurationHistoryEntity[]> {
    return this.historyRepository.getHistory(configurationId);
  }

  /**
   * Get a specific version
   */
  async getVersion(configurationId: number, version: number): Promise<ConfigurationHistoryEntity> {
    const entity = await this.historyRepository.getVersion(configurationId, version);
    if (!entity) {
      throw new NotFoundException(`Version ${version} not found for configuration ${configurationId}`);
    }
    return entity;
  }

  /**
   * Get recent changes across all configurations
   */
  async getRecentChanges(limit: number = 50): Promise<ConfigurationHistoryEntity[]> {
    return this.historyRepository.getRecentChanges(limit);
  }

  /**
   * Restore a configuration to a specific version
   */
  async restoreVersion(configurationId: number, version: number, userId: string): Promise<void> {
    const historyEntity = await this.getVersion(configurationId, version);
    const snapshot = historyEntity.snapshot;

    // First, save the current state as a snapshot before restoring (outside transaction)
    await this.saveSnapshot(configurationId, userId, 'restore', `Restoring to version ${version}`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const configuration = await queryRunner.manager.findOne(ConfigurationEntity, {
        where: { id: configurationId },
        relations: ['extensions', 'userGroups'],
      });

      if (!configuration) {
        throw new NotFoundException(`Configuration ${configurationId} not found`);
      }

      // Update configuration fields
      configuration.name = snapshot.name;
      configuration.description = snapshot.description;
      configuration.agentName = snapshot.agentName;
      configuration.chatFooter = snapshot.chatFooter;
      configuration.chatSuggestions = snapshot.chatSuggestions;
      configuration.executorEndpoint = snapshot.executorEndpoint;
      configuration.executorHeaders = snapshot.executorHeaders;

      // Map snapshot status back to enum
      const statusMap = {
        enabled: ConfigurationStatus.ENABLED,
        disabled: ConfigurationStatus.DISABLED,
        deleted: ConfigurationStatus.DELETED,
      };
      configuration.status = statusMap[snapshot.status];

      // Delete existing extensions
      if (configuration.extensions && configuration.extensions.length > 0) {
        await queryRunner.manager.remove(configuration.extensions);
      }

      // Recreate extensions from snapshot
      const newExtensions = snapshot.extensions.map((extSnapshot) => {
        return queryRunner.manager.create(ExtensionEntity, {
          name: extSnapshot.name,
          externalId: extSnapshot.externalId,
          enabled: extSnapshot.enabled,
          values: extSnapshot.values,
          state: extSnapshot.state,
          configurableArguments: extSnapshot.configurableArguments,
          configurationId: configuration.id,
        });
      });

      configuration.extensions = newExtensions;

      await queryRunner.manager.save(ConfigurationEntity, configuration);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Compare two versions and return the differences
   */
  async compareVersions(
    configurationId: number,
    fromVersion: number,
    toVersion: number,
  ): Promise<{ from: ConfigurationHistoryEntity; to: ConfigurationHistoryEntity }> {
    const from = await this.getVersion(configurationId, fromVersion);
    const to = await this.getVersion(configurationId, toVersion);

    return { from, to };
  }
}
