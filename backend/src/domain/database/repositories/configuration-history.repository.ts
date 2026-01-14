import { Repository } from 'typeorm';
import { ConfigurationHistoryEntity, ConfigurationSnapshot } from '../entities';

export class ConfigurationHistoryRepository extends Repository<ConfigurationHistoryEntity> {
  /**
   * Save a new snapshot for a configuration
   */
  async createSnapshot(
    configurationId: number,
    snapshot: ConfigurationSnapshot,
    userId: string,
    action: string,
    comment?: string,
  ): Promise<ConfigurationHistoryEntity> {
    // Get the next version number for this configuration
    const versionCount = await this.getVersionCount(configurationId);
    const version = versionCount + 1;

    const entity = this.create({
      configurationId,
      version,
      action,
      changedBy: userId,
      snapshot,
      changeComment: comment,
    });

    return this.save(entity);
  }

  /**
   * Get all versions for a configuration, ordered by version descending
   */
  async getHistory(configurationId: number): Promise<ConfigurationHistoryEntity[]> {
    return this.find({
      where: { configurationId },
      order: { version: 'DESC' },
      relations: ['user'],
    });
  }

  /**
   * Get a specific version for a configuration
   */
  async getVersion(configurationId: number, version: number): Promise<ConfigurationHistoryEntity | null> {
    return this.findOne({
      where: { configurationId, version },
      relations: ['user'],
    });
  }

  /**
   * Get the latest version for a configuration
   */
  async getLatestVersion(configurationId: number): Promise<ConfigurationHistoryEntity | null> {
    return this.findOne({
      where: { configurationId },
      order: { version: 'DESC' },
      relations: ['user'],
    });
  }

  /**
   * Get version count for a configuration
   */
  async getVersionCount(configurationId: number): Promise<number> {
    return this.count({ where: { configurationId } });
  }

  /**
   * Get changes by user
   */
  async getChangesByUser(userId: string): Promise<ConfigurationHistoryEntity[]> {
    return this.find({
      where: { changedBy: userId },
      order: { createdAt: 'DESC' },
      relations: ['user', 'configuration'],
    });
  }

  /**
   * Get recent changes across all configurations
   */
  async getRecentChanges(limit: number = 50): Promise<ConfigurationHistoryEntity[]> {
    return this.find({
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['user', 'configuration'],
    });
  }
}
