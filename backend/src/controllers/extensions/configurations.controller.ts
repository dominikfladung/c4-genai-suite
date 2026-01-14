import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { LocalAuthGuard, Role, RoleGuard } from 'src/domain/auth';
import { BUILTIN_USER_GROUP_ADMIN } from 'src/domain/database';
import {
  ConfiguredExtension,
  CreateConfiguration,
  CreateConfigurationResponse,
  CreateExtension,
  CreateExtensionResponse,
  DeleteConfiguration,
  DeleteExtension,
  DuplicateConfiguration,
  GetBucketAvailability,
  GetBucketAvailabilityResponse,
  GetConfiguration,
  GetConfigurationResponse,
  GetConfigurations,
  GetConfigurationsResponse,
  GetExtensions,
  GetExtensionsResponse,
  UpdateConfiguration,
  UpdateConfigurationResponse,
  UpdateExtension,
  UpdateExtensionResponse,
} from 'src/domain/extensions';
import { ConfigurationHistoryService, ExplorerService } from 'src/domain/extensions/services';
import {
  GetConfigurationUserValues,
  GetConfigurationUserValuesResponse,
} from 'src/domain/extensions/use-cases/get-configuration-user-values';
import { DuplicateConfigurationResponse } from '../../domain/extensions/use-cases';
import { UpdateConfigurationUserValues } from '../../domain/extensions/use-cases/update-configuration-user-values';
import {
  BucketAvailabilityDto,
  ConfigurationDto,
  ConfigurationHistoryDto,
  ConfigurationsDto,
  ConfigurationUserValuesDto,
  CreateExtensionDto,
  ExtensionDto,
  ExtensionsDto,
  UpdateExtensionDto,
  UpsertConfigurationDto,
} from './dtos';

@Controller('configurations')
@ApiTags('extensions')
@UseGuards(LocalAuthGuard)
export class ConfigurationsController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    private readonly explorer: ExplorerService,
    private readonly historyService: ConfigurationHistoryService,
  ) {}

  @Get('')
  @ApiOperation({ operationId: 'getConfigurations', description: 'Gets the configured and available extensions.' })
  @ApiQuery({
    name: 'enabled',
    description: 'Indicates if only enabled configurations should be returned.',
    required: false,
    type: Boolean,
  })
  @ApiOkResponse({ type: ConfigurationsDto })
  async getConfigurations(@Req() req: Request, @Query('enabled') enabled?: boolean) {
    const fetchEnabledWithExtensions = enabled ?? false;

    const result: GetConfigurationsResponse = await this.queryBus.execute(
      new GetConfigurations(req.user, fetchEnabledWithExtensions, fetchEnabledWithExtensions),
    );
    return ConfigurationsDto.fromDomain(result.configurations);
  }

  @Get(':id')
  @ApiOperation({ operationId: 'getConfiguration', description: 'Gets a configuration with the given id.' })
  @ApiOkResponse({ type: ConfigurationDto })
  @ApiParam({
    name: 'id',
    description: 'The ID of the configuration',
    required: true,
    type: Number,
  })
  @Role(BUILTIN_USER_GROUP_ADMIN)
  @UseGuards(RoleGuard)
  async getConfiguration(@Param('id') id: number) {
    const result: GetConfigurationResponse = await this.queryBus.execute(new GetConfiguration(id));

    return ConfigurationDto.fromDomain(result.configuration);
  }

  @Post('')
  @ApiOperation({ operationId: 'postConfiguration', description: 'Creates a configuration.' })
  @ApiOkResponse({ type: ConfigurationDto })
  @Role(BUILTIN_USER_GROUP_ADMIN)
  @UseGuards(RoleGuard)
  async postConfiguration(@Body() body: UpsertConfigurationDto, @Req() req: Request) {
    const command = new CreateConfiguration(body, req.user.id);

    const result: CreateConfigurationResponse = await this.commandBus.execute(command);

    return ConfigurationDto.fromDomain(result.configuration);
  }

  @Put(':id')
  @ApiOperation({ operationId: 'putConfiguration', description: 'Updates an extension.' })
  @ApiParam({
    name: 'id',
    description: 'The ID of the configuration.',
    required: true,
    type: Number,
  })
  @ApiOkResponse({ type: ConfigurationDto })
  @Role(BUILTIN_USER_GROUP_ADMIN)
  @UseGuards(RoleGuard)
  async putConfiguration(@Param('id') id: number, @Body() body: UpsertConfigurationDto, @Req() req: Request) {
    const command = new UpdateConfiguration(id, body, req.user.id);

    const result: UpdateConfigurationResponse = await this.commandBus.execute(command);

    return ConfigurationDto.fromDomain(result.configuration);
  }

  @Delete(':id')
  @ApiOperation({ operationId: 'deleteConfiguration', description: 'Deletes a configuration.' })
  @ApiParam({
    name: 'id',
    description: 'The ID of the configuration.',
    required: true,
    type: Number,
  })
  @ApiNoContentResponse()
  @Role(BUILTIN_USER_GROUP_ADMIN)
  @UseGuards(RoleGuard)
  async deleteConfiguration(@Param('id') id: number, @Req() req: Request) {
    const command = new DeleteConfiguration(id, req.user.id);

    await this.commandBus.execute(command);
  }

  @Get(':id/user-values')
  @ApiOperation({ operationId: 'getConfigurationUserValues', description: 'Gets the user configured values.' })
  @ApiParam({
    name: 'id',
    description: 'The ID of the configuration.',
    required: true,
    type: Number,
  })
  @ApiOkResponse({ type: ConfigurationUserValuesDto })
  async getConfigurationUserValues(@Param('id') id: number, @Req() req: Request) {
    const result: GetConfigurationUserValuesResponse = await this.queryBus.execute(
      new GetConfigurationUserValues(id, req.user.id),
    );
    return ConfigurationUserValuesDto.fromDomain(result.configuration);
  }

  @Put(':id/user-values')
  @ApiOperation({ operationId: 'updateConfigurationUserValues', description: 'Updates the user configured values.' })
  @ApiParam({
    name: 'id',
    description: 'The ID of the configuration.',
    required: true,
    type: Number,
  })
  @ApiOkResponse({ type: ConfigurationUserValuesDto })
  async updateConfigurationUserValues(@Param('id') id: number, @Body() body: ConfigurationUserValuesDto, @Req() req: Request) {
    await this.queryBus.execute(new UpdateConfigurationUserValues(id, req.user.id, body.values));
    return body;
  }

  @Get(':id/extensions')
  @ApiOperation({ operationId: 'getExtensions', description: 'Gets the configured and available extensions.' })
  @ApiParam({
    name: 'id',
    description: 'The ID of the configuration.',
    required: true,
    type: Number,
  })
  @ApiOkResponse({ type: ExtensionsDto })
  async getExtensions(@Param('id') id: number) {
    const result: GetExtensionsResponse = await this.queryBus.execute(new GetExtensions(id, true));
    return ExtensionsDto.fromDomain(result.extensions, this.explorer.getExtensions().map(ConfiguredExtension.createInitial));
  }

  @Post(':id/extensions')
  @ApiOperation({ operationId: 'postExtension', description: 'Creates an extension.' })
  @ApiParam({
    name: 'id',
    description: 'The ID of the configuration.',
    required: true,
    type: Number,
  })
  @ApiOkResponse({ type: ExtensionDto })
  @Role(BUILTIN_USER_GROUP_ADMIN)
  @UseGuards(RoleGuard)
  async postExtension(@Param('id') id: number, @Body() body: CreateExtensionDto, @Req() req: Request) {
    const command = new CreateExtension(id, body, req.user.id);
    const result: CreateExtensionResponse = await this.commandBus.execute(command);

    return ExtensionDto.fromDomain(result.extension);
  }

  @Put(':id/extensions/:extensionId')
  @ApiOperation({ operationId: 'putExtension', description: 'Updates an extension.' })
  @ApiParam({
    name: 'id',
    description: 'The ID of the configuration.',
    required: true,
    type: Number,
  })
  @ApiParam({
    name: 'extensionId',
    description: 'The ID of the extension.',
    required: true,
    type: Number,
  })
  @ApiOkResponse({ type: ExtensionDto })
  @Role(BUILTIN_USER_GROUP_ADMIN)
  @UseGuards(RoleGuard)
  async putExtension(
    @Param('id') id: number,
    @Param('extensionId') extensionId: number,
    @Body() body: UpdateExtensionDto,
    @Req() req: Request,
  ) {
    const command = new UpdateExtension(+extensionId, body, req.user.id, id);

    const result: UpdateExtensionResponse = await this.commandBus.execute(command);

    return ExtensionDto.fromDomain(result.extension);
  }

  @Delete(':id/extensions/:extensionId')
  @ApiOperation({ operationId: 'deleteExtension', description: 'Deletes an extension.' })
  @ApiParam({
    name: 'id',
    description: 'The ID of the configuration.',
    required: true,
    type: Number,
  })
  @ApiParam({
    name: 'extensionId',
    description: 'The ID of the extension.',
    required: true,
    type: Number,
  })
  @ApiNoContentResponse()
  @Role(BUILTIN_USER_GROUP_ADMIN)
  @UseGuards(RoleGuard)
  async deleteExtension(@Param('id') id: number, @Param('extensionId') extensionId: number, @Req() req: Request) {
    const command = new DeleteExtension(+extensionId, req.user.id, id);

    await this.commandBus.execute(command);
  }

  @Get(':id/checkBucketAvailability/:type')
  @ApiOperation({
    operationId: 'getBucketAvailability',
    description: 'Checks if this configuration has a user or conversation bucket and if yes by which extension it is provided.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the configuration.',
    required: true,
    type: Number,
  })
  @ApiParam({
    name: 'type',
    description: 'The type of bucket (user or conversation).',
    required: true,
    enum: ['user', 'conversation'],
  })
  @ApiOkResponse({ type: BucketAvailabilityDto })
  async getBucketAvailability(
    @Param('id', ParseIntPipe) configurationId: number,
    @Param('type') bucketType: 'user' | 'conversation',
  ) {
    const query = new GetBucketAvailability(configurationId, bucketType);
    const result: GetBucketAvailabilityResponse = await this.queryBus.execute(query);

    return BucketAvailabilityDto.fromDomain(result);
  }

  @Post('/duplicate/:id')
  @ApiOperation({ operationId: 'duplicateConfiguration', description: 'Duplicate a configuration.' })
  @ApiParam({
    name: 'id',
    description: 'The ID of the configuration to duplicate.',
    required: true,
    type: Number,
  })
  @ApiOkResponse({ type: ConfigurationDto })
  @Role(BUILTIN_USER_GROUP_ADMIN)
  @UseGuards(RoleGuard)
  async duplicate(@Param('id') id: number, @Req() req: Request) {
    const command = new DuplicateConfiguration(id, req.user.id);

    const result: DuplicateConfigurationResponse = await this.commandBus.execute(command);

    return ConfigurationDto.fromDomain(result.configuration);
  }

  @Get(':id/history')
  @ApiOperation({ operationId: 'getConfigurationHistory', description: 'Gets version history for a configuration.' })
  @ApiParam({
    name: 'id',
    description: 'The ID of the configuration.',
    required: true,
    type: Number,
  })
  @ApiOkResponse({ type: [ConfigurationHistoryDto] })
  @Role(BUILTIN_USER_GROUP_ADMIN)
  @UseGuards(RoleGuard)
  async getConfigurationHistory(@Param('id', ParseIntPipe) id: number): Promise<ConfigurationHistoryDto[]> {
    const history = await this.historyService.getHistory(id);
    return history.map(ConfigurationHistoryDto.fromDomain);
  }

  @Get(':id/history/:version')
  @ApiOperation({ operationId: 'getConfigurationVersion', description: 'Gets a specific version of a configuration.' })
  @ApiParam({
    name: 'id',
    description: 'The ID of the configuration.',
    required: true,
    type: Number,
  })
  @ApiParam({
    name: 'version',
    description: 'The version number.',
    required: true,
    type: Number,
  })
  @ApiOkResponse({ type: ConfigurationHistoryDto })
  @Role(BUILTIN_USER_GROUP_ADMIN)
  @UseGuards(RoleGuard)
  async getConfigurationVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<ConfigurationHistoryDto> {
    const historyEntry = await this.historyService.getVersion(id, version);
    return ConfigurationHistoryDto.fromDomain(historyEntry);
  }

  @Post(':id/history/:version/restore')
  @ApiOperation({ operationId: 'restoreConfiguration', description: 'Restores a configuration to a specific version.' })
  @ApiParam({
    name: 'id',
    description: 'The ID of the configuration.',
    required: true,
    type: Number,
  })
  @ApiParam({
    name: 'version',
    description: 'The version number to restore to.',
    required: true,
    type: Number,
  })
  @ApiOkResponse({ type: ConfigurationDto })
  @Role(BUILTIN_USER_GROUP_ADMIN)
  @UseGuards(RoleGuard)
  async restoreConfiguration(
    @Param('id', ParseIntPipe) id: number,
    @Param('version', ParseIntPipe) version: number,
    @Req() req: Request,
  ): Promise<ConfigurationDto> {
    await this.historyService.restoreVersion(id, version, req.user.id);
    // Get the updated configuration
    const result: GetConfigurationResponse = await this.queryBus.execute(new GetConfiguration(id));
    return ConfigurationDto.fromDomain(result.configuration);
  }

  @Get(':id/history/compare/:fromVersion/:toVersion')
  @ApiOperation({ operationId: 'compareVersions', description: 'Compares two versions of a configuration.' })
  @ApiParam({
    name: 'id',
    description: 'The ID of the configuration.',
    required: true,
    type: Number,
  })
  @ApiParam({
    name: 'fromVersion',
    description: 'The starting version number.',
    required: true,
    type: Number,
  })
  @ApiParam({
    name: 'toVersion',
    description: 'The ending version number.',
    required: true,
    type: Number,
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        from: { $ref: '#/components/schemas/ConfigurationHistoryDto' },
        to: { $ref: '#/components/schemas/ConfigurationHistoryDto' },
      },
    },
  })
  @Role(BUILTIN_USER_GROUP_ADMIN)
  @UseGuards(RoleGuard)
  async compareVersions(
    @Param('id', ParseIntPipe) id: number,
    @Param('fromVersion', ParseIntPipe) fromVersion: number,
    @Param('toVersion', ParseIntPipe) toVersion: number,
  ) {
    const comparison = await this.historyService.compareVersions(id, fromVersion, toVersion);
    return {
      from: ConfigurationHistoryDto.fromDomain(comparison.from),
      to: ConfigurationHistoryDto.fromDomain(comparison.to),
    };
  }

  @Get('history/recent')
  @ApiOperation({
    operationId: 'getRecentChanges',
    description: 'Gets recent changes across all configurations.',
  })
  @ApiQuery({
    name: 'limit',
    description: 'Maximum number of results to return.',
    required: false,
    type: Number,
  })
  @ApiOkResponse({ type: [ConfigurationHistoryDto] })
  @Role(BUILTIN_USER_GROUP_ADMIN)
  @UseGuards(RoleGuard)
  async getRecentChanges(@Query('limit', ParseIntPipe) limit: number = 50): Promise<ConfigurationHistoryDto[]> {
    const history = await this.historyService.getRecentChanges(limit);
    return history.map(ConfigurationHistoryDto.fromDomain);
  }
}
