import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In } from 'typeorm';
import {
  ConfigurationEntity,
  ConfigurationRepository,
  ConfigurationStatus,
  UserGroupEntity,
  UserGroupRepository,
} from 'src/domain/database';
import { assignDefined } from 'src/lib';
import { ConfigurationHistoryService } from '../services';
import { ConfigurationModel } from '../interfaces';
import { buildConfiguration } from './utils';

type Values = Partial<
  Pick<
    ConfigurationModel,
    | 'agentName'
    | 'chatFooter'
    | 'chatSuggestions'
    | 'enabled'
    | 'executorEndpoint'
    | 'executorHeaders'
    | 'name'
    | 'description'
    | 'userGroupIds'
  >
>;

export class CreateConfiguration {
  constructor(
    public readonly values: Values,
    public readonly userId?: string,
  ) {}
}

export class CreateConfigurationResponse {
  constructor(public readonly configuration: ConfigurationModel) {}
}

@CommandHandler(CreateConfiguration)
export class CreateConfigurationHandler implements ICommandHandler<CreateConfiguration, CreateConfigurationResponse> {
  constructor(
    @InjectRepository(ConfigurationEntity)
    private readonly configurations: ConfigurationRepository,
    @InjectRepository(UserGroupEntity)
    private readonly userGroups: UserGroupRepository,
    private readonly historyService: ConfigurationHistoryService,
  ) {}

  async execute(command: CreateConfiguration): Promise<any> {
    const { values, userId } = command;
    const {
      agentName,
      chatFooter,
      chatSuggestions,
      enabled,
      executorEndpoint,
      executorHeaders,
      name,
      description,
      userGroupIds,
    } = values;

    const entity = this.configurations.create();

    if (userGroupIds) {
      entity.userGroups = await this.userGroups.findBy({ id: In(userGroupIds) });
    }

    // Assign the object manually to avoid updating unexpected values.
    assignDefined(entity, {
      agentName,
      chatFooter,
      chatSuggestions,
      status: enabled ? ConfigurationStatus.ENABLED : ConfigurationStatus.DISABLED,
      executorEndpoint,
      executorHeaders,
      name,
      description,
    });

    // Use the save method otherwise we would not get previous values.
    const created = await this.configurations.save(entity);
    const result = await buildConfiguration(created);

    // Save initial snapshot after creation
    if (userId) {
      await this.historyService.saveSnapshot(created.id, userId, 'create', 'Initial configuration created');
    }

    return new CreateConfigurationResponse(result);
  }
}
