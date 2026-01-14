import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Repository } from 'typeorm';
import { ChatSuggestion } from 'src/domain/shared';
import { schema } from '../typeorm.helper';
import { ConfigurationEntity } from './configuration';
import { UserEntity } from './user';

export type ConfigurationHistoryRepository = Repository<ConfigurationHistoryEntity>;

export interface ConfigurationSnapshot {
  name: string;
  description: string;
  status: 'enabled' | 'disabled' | 'deleted';
  agentName?: string;
  chatFooter?: string;
  chatSuggestions?: ChatSuggestion[];
  executorEndpoint?: string;
  executorHeaders?: string;
  userGroupIds: string[];
  extensions: ExtensionSnapshot[];
}

export interface ExtensionSnapshot {
  externalId: string;
  name: string;
  enabled: boolean;
  values: Record<string, any>;
  state: Record<string, any>;
  configurableArguments: Record<string, any>;
}

@Entity({ name: 'configuration_history', schema })
export class ConfigurationHistoryEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  configurationId!: number;

  @ManyToOne(() => ConfigurationEntity)
  @JoinColumn({ name: 'configurationId' })
  configuration!: ConfigurationEntity;

  @Column({ type: 'int' })
  version!: number;

  @Column({ type: 'varchar' })
  action!: string;

  @Column({ type: 'varchar', nullable: true })
  changedBy?: string;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'changedBy' })
  user?: UserEntity;

  @Column({ type: 'jsonb' })
  snapshot!: ConfigurationSnapshot;

  @Column({ type: 'text', nullable: true })
  changeComment?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
