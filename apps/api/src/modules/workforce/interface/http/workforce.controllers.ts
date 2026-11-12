import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  createEmployeeSchema,
  createLocationSchema,
  updateEmployeeSchema,
  updateLocationSchema,
  type CreateEmployeeRequest,
  type CheckinCode,
  type CreateEmployeeResponse,
  type CreateLocationRequest,
  type EmployeeView,
  type InviteLink,
  type LocationView,
  type UpdateEmployeeRequest,
  type UpdateLocationRequest,
} from '@xrostr/contracts';
import { unwrap } from '../../../../shared/interface/http/domain-error.exception.js';
import { ZodValidationPipe } from '../../../../shared/interface/http/zod-validation.pipe.js';
import {
  CurrentPrincipal,
  RequirePermissions,
  type Principal,
} from '../../../identity/public-api.js';
import { EmployeesService } from '../../application/employees.service.js';
import { LocationsService } from '../../application/locations.service.js';

@Controller('tenant/locations')
export class LocationsController {
  constructor(private readonly service: LocationsService) {}

  @RequirePermissions('locations.read')
  @Get()
  list(@CurrentPrincipal() actor: Principal): Promise<LocationView[]> {
    return this.service.list(actor);
  }

  @RequirePermissions('locations.manage')
  @Post()
  async create(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createLocationSchema)) body: CreateLocationRequest,
  ): Promise<LocationView> {
    return unwrap(await this.service.create(actor, body));
  }

  @RequirePermissions('locations.manage')
  @Get(':id/checkin-code')
  async checkinCode(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CheckinCode> {
    return unwrap(await this.service.checkinCode(actor, id));
  }

  @RequirePermissions('locations.manage')
  @Post(':id/checkin-code/rotate')
  @HttpCode(200)
  async rotateCheckinCode(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CheckinCode> {
    return unwrap(await this.service.rotateCheckinCode(actor, id));
  }

  @RequirePermissions('locations.manage')
  @Patch(':id')
  async update(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLocationSchema)) body: UpdateLocationRequest,
  ): Promise<LocationView> {
    return unwrap(await this.service.update(actor, id, body));
  }
}

@Controller('tenant/employees')
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @RequirePermissions('employees.read')
  @Get()
  list(@CurrentPrincipal() actor: Principal): Promise<EmployeeView[]> {
    return this.service.list(actor);
  }

  @RequirePermissions('employees.manage')
  @Post()
  async create(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createEmployeeSchema)) body: CreateEmployeeRequest,
  ): Promise<CreateEmployeeResponse> {
    return unwrap(await this.service.create(actor, body));
  }

  @RequirePermissions('employees.manage')
  @Patch(':id')
  async update(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEmployeeSchema)) body: UpdateEmployeeRequest,
  ): Promise<EmployeeView> {
    return unwrap(await this.service.update(actor, id, body));
  }

  @RequirePermissions('employees.manage')
  @Post(':id/invite')
  @HttpCode(200)
  async reissueInvite(
    @CurrentPrincipal() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InviteLink> {
    return unwrap(await this.service.reissueInvite(actor, id));
  }
}
