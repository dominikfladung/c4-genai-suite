import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not } from 'typeorm';
import {
  ConfigurationEntity,
  ConfigurationRepository,
  ConfigurationStatus,
  UserGroupEntity,
  UserGroupRepository,
} from 'src/domain/database';
import { assignDefined } from 'src/lib';
import { ConfigurationModel } from '../interfaces';
import { ConfigurationHistoryService } from '../services';
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

export class UpdateConfiguration {
  constructor(
    public readonly id: number,
    public readonly values: Values,
    public readonly userId?: string,
  ) {}
}

export class UpdateConfigurationResponse {
  constructor(public readonly configuration: ConfigurationModel) {}
}

@CommandHandler(UpdateConfiguration)
export class UpdateConfigurationHandler implements ICommandHandler<UpdateConfiguration, UpdateConfigurationResponse> {
  constructor(
    @InjectRepository(ConfigurationEntity)
    private readonly configurations: ConfigurationRepository,
    @InjectRepository(UserGroupEntity)
    private readonly userGroups: UserGroupRepository,
    private readonly historyService: ConfigurationHistoryService,
  ) {}

  async execute(command: UpdateConfiguration): Promise<any> {
    const { id, values, userId } = command;
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

    const entity = await this.configurations.findOne({
      where: { id, status: Not(ConfigurationStatus.DELETED) },
      relations: {
        userGroups: true,
      },
    });

    if (!entity) {
      throw new NotFoundException();
    }

    // Save snapshot before updating.
    // NOTE: This snapshot is intentionally saved outside of the database transaction
    // used for the actual configuration update. As a result, it is possible for the
    // snapshot to be persisted even if the subsequent update fails, or for the update
    // to succeed while the snapshot save fails. This mirrors the behavior of delete
    // operations where snapshots are also taken outside the main transaction to avoid
    // potential deadlocks. Consumers of configuration history should be aware that the
    // history is best-effort and may contain such inconsistencies. If stronger
    // consistency guarantees are required, both this handler and the
    // ConfigurationHistoryService must be adapted to participate in the same
    // transaction boundary.
    if (userId) {
      await this.historyService.saveSnapshot(id, userId, 'update', 'Configuration updated');
    }

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
    const updated = await this.configurations.save(entity);
    const result = await buildConfiguration(updated);

    return new UpdateConfigurationResponse(result);
  }
}
