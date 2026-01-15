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
    // Use a transaction with pessimistic locking to prevent race conditions
    // when multiple operations try to create snapshots for the same configuration
    return this.manager.transaction(async (manager) => {
      const historyRepo = manager.getRepository(ConfigurationHistoryEntity);

      // Get the next version number with pessimistic write lock to prevent race conditions
      const result = await historyRepo
        .createQueryBuilder('history')
        .select('COALESCE(MAX(history.version), 0)', 'max')
        .where('history.configurationId = :configurationId', { configurationId })
        .setLock('pessimistic_write')
        .getRawOne<{ max: string }>();

      const version = Number(result?.max || 0) + 1;

      const entity = historyRepo.create({
        configurationId,
        version,
        action,
        changedBy: userId,
        snapshot,
        changeComment: comment,
      });

      return historyRepo.save(entity);
    });
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
