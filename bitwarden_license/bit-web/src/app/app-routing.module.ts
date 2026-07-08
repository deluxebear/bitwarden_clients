import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

import { authGuard, unauthGuardFn } from "@bitwarden/angular/auth/guards";
import { canAccessSettingsTab } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { AnonLayoutWrapperComponent } from "@bitwarden/components";
import { organizationPermissionsGuard } from "@bitwarden/web-vault/app/admin-console/organizations/guards/org-permissions.guard";
import { OrganizationLayoutComponent } from "@bitwarden/web-vault/app/admin-console/organizations/layouts/organization-layout.component";
import { deepLinkGuard } from "@bitwarden/web-vault/app/auth/guards/deep-link/deep-link.guard";
import { RouteDataProperties } from "@bitwarden/web-vault/app/core";

import { organizationSettingsRoutes } from "./admin-console/organizations/organizations-routing.module";
import { ProvidersModule } from "./admin-console/providers/providers.module";
import { VerifyRecoverDeleteProviderComponent } from "./admin-console/providers/verify-recover-delete-provider.component";

const organizationSettingsAppRoutes: Routes = organizationSettingsRoutes.map((route) => ({
  path: `organizations/:organizationId/settings/${route.path}`,
  component: OrganizationLayoutComponent,
  canActivate: [deepLinkGuard(), authGuard, organizationPermissionsGuard(canAccessSettingsTab)],
  children: [{ ...route, path: "" }],
}));

const routes: Routes = [
  {
    path: "providers",
    canActivate: [deepLinkGuard()],
    loadChildren: () => ProvidersModule,
  },
  {
    path: "sm",
    canActivate: [deepLinkGuard()],
    loadChildren: async () =>
      (await import("./secrets-manager/secrets-manager.module")).SecretsManagerModule,
  },
  ...organizationSettingsAppRoutes,
  {
    path: "verify-recover-delete-provider",
    component: AnonLayoutWrapperComponent,
    canActivate: [unauthGuardFn()],
    children: [
      {
        path: "",
        component: VerifyRecoverDeleteProviderComponent,
        data: { titleId: "deleteAccount" } satisfies RouteDataProperties,
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
