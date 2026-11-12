import { Injectable } from '@nestjs/common';
import { PatrolRouteRepository } from './ports.js';

/** Public API of the patrol module for other modules (safety). Requires a tenant unit of work. */
@Injectable()
export class PatrolDirectory {
  constructor(private readonly routes: PatrolRouteRepository) {}

  async routeNames(ids: readonly string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    for (const id of new Set(ids)) {
      const route = await this.routes.findById(id);
      if (route) names.set(id, route.name);
    }
    return names;
  }
}
