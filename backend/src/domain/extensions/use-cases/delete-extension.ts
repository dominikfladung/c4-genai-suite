import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtensionEntity, ExtensionRepository } from 'src/domain/database';
import { ConfigurationHistoryService } from '../services';

export class DeleteExtension {
  constructor(
    public readonly id: number,
    public readonly userId?: string,
    public readonly configurationId?: number,
  ) {}
}

@CommandHandler(DeleteExtension)
export class DeleteExtensionHandler implements ICommandHandler<DeleteExtension, any> {
  constructor(
    @InjectRepository(ExtensionEntity)
    private readonly extensions: ExtensionRepository,
    private readonly historyService: ConfigurationHistoryService,
  ) {}

  async execute(command: DeleteExtension): Promise<any> {
    const { id, userId, configurationId } = command;

    // Get extension details before deletion for snapshot
    const extension = await this.extensions.findOneBy({ id: command.id });

    if (!extension) {
      throw new NotFoundException();
    }

    // Save configuration snapshot before deleting extension
    if (userId && (configurationId || extension.configurationId)) {
      const cfgId = configurationId || extension.configurationId;
      await this.historyService.saveSnapshot(cfgId, userId, 'update', `Extension ${extension.name} deleted`);
    }

    const result = await this.extensions.delete({ id: command.id });

    if (!result.affected) {
      throw new NotFoundException();
    }
  }
}
