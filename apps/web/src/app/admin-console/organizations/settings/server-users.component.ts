// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { ChangeDetectionStrategy, Component, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { debounceTime } from "rxjs/operators";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { DialogService, SearchModule, TableDataSource, ToastService } from "@bitwarden/components";

import { HeaderModule } from "../../../layouts/header/header.module";
import { SharedModule } from "../../../shared";

type ServerUserOrganization = {
  id: string;
  name: string | null;
  organizationUserId: string;
  email: string;
  status: number;
  type: number;
};

type ServerUser = {
  id: string;
  name: string | null;
  email: string;
  emailVerified: boolean;
  premium: boolean;
  forcePasswordReset: boolean;
  twoFactorEnabled: boolean;
  creationDate: string;
  revisionDate: string;
  lastEmailChangeDate: string | null;
  organizationCount: number;
  organizations: ServerUserOrganization[];
};

type ServerUsersResponse = {
  object: "list";
  data: ServerUser[];
  continuationToken: string | null;
};

const organizationUserStatus = {
  invited: 0,
  accepted: 1,
  confirmed: 2,
  revoked: -1,
  revokedLegacy: 3,
} as const;

const serverUsersFilter = (filter: string) => {
  const normalizedFilter = (filter ?? "").trim().toLowerCase();

  return (user: ServerUser) => {
    if (normalizedFilter.length === 0) {
      return true;
    }

    return [
      user.id,
      user.name,
      user.email,
      ...user.organizations.map((organization) => organization.name),
    ].some((value) => value?.toLowerCase().includes(normalizedFilter));
  };
};

@Component({
  templateUrl: "server-users.component.html",
  imports: [SharedModule, HeaderModule, SearchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServerUsersComponent {
  protected readonly loading = signal(true);
  protected readonly deletingUserId = signal<string | null>(null);
  protected readonly updatingMembershipUserId = signal<string | null>(null);
  protected readonly loadError = signal(false);
  protected readonly currentUserId = signal<string | null>(null);
  protected readonly organizationId = signal<string | null>(null);
  protected readonly dataSource = new TableDataSource<ServerUser>();
  protected readonly searchControl = new FormControl("");
  protected readonly organizationUserStatus = organizationUserStatus;

  constructor(
    private readonly apiService: ApiService,
    private readonly accountService: AccountService,
    private readonly dialogService: DialogService,
    private readonly i18nService: I18nService,
    private readonly logService: LogService,
    private readonly route: ActivatedRoute,
    private readonly toastService: ToastService,
  ) {
    this.searchControl.valueChanges
      .pipe(debounceTime(200), takeUntilDestroyed())
      .subscribe((value) => (this.dataSource.filter = serverUsersFilter(value)));

    void this.initialize();
  }

  protected async loadUsers() {
    this.loading.set(true);
    this.loadError.set(false);

    try {
      const response = (await this.apiService.send(
        "GET",
        "/admin/users?limit=500",
        null,
        true,
        true,
      )) as ServerUsersResponse;

      this.dataSource.data = response.data ?? [];
      this.dataSource.filter = serverUsersFilter(this.searchControl.value);
    } catch (error) {
      this.logService.error(error);
      this.loadError.set(true);
      this.toastService.showToast({
        variant: "error",
        title: null,
        message: this.i18nService.t("loadServerUsersFailed"),
      });
    } finally {
      this.loading.set(false);
    }
  }

  protected async deleteUser(user: ServerUser) {
    if (user.id === this.currentUserId() || this.deletingUserId() != null) {
      return;
    }

    const confirmed = await this.dialogService.openSimpleDialog({
      title: { key: "deleteServerUser" },
      content: { key: "deleteServerUserConfirmation", placeholders: [user.email] },
      type: "warning",
      acceptButtonText: { key: "delete" },
      cancelButtonText: { key: "cancel" },
    });

    if (!confirmed) {
      return;
    }

    this.deletingUserId.set(user.id);

    try {
      await this.apiService.send("DELETE", `/admin/users/${user.id}`, null, true, false);
      this.dataSource.data = this.dataSource.data.filter(
        (existingUser) => existingUser.id !== user.id,
      );
      this.toastService.showToast({
        variant: "success",
        title: null,
        message: this.i18nService.t("deletedServerUser", user.email),
      });
    } catch (error) {
      this.logService.error(error);
      this.toastService.showToast({
        variant: "error",
        title: null,
        message: this.i18nService.t("deleteServerUserFailed"),
      });
    } finally {
      this.deletingUserId.set(null);
    }
  }

  protected async addUserToCurrentOrganization(user: ServerUser) {
    const orgId = this.organizationId();
    if (orgId == null || this.updatingMembershipUserId() != null) {
      return;
    }

    const confirmed = await this.dialogService.openSimpleDialog({
      title: { key: "addServerUserToCurrentOrganization" },
      content: {
        key: "addServerUserToCurrentOrganizationConfirmation",
        placeholders: [user.email],
      },
      type: "warning",
      acceptButtonText: { key: "add" },
      cancelButtonText: { key: "cancel" },
    });

    if (!confirmed) {
      return;
    }

    this.updatingMembershipUserId.set(user.id);

    try {
      await this.apiService.send(
        "POST",
        `/admin/users/${user.id}/organizations/${orgId}`,
        null,
        true,
        true,
      );
      await this.loadUsers();
      this.toastService.showToast({
        variant: "success",
        title: null,
        message: this.i18nService.t("addedServerUserToCurrentOrganization", user.email),
      });
    } catch (error) {
      this.logService.error(error);
      this.toastService.showToast({
        variant: "error",
        title: null,
        message: this.i18nService.t("addServerUserToCurrentOrganizationFailed"),
      });
    } finally {
      this.updatingMembershipUserId.set(null);
    }
  }

  protected async revokeCurrentOrganizationAccess(user: ServerUser) {
    const orgId = this.organizationId();
    if (
      orgId == null ||
      this.updatingMembershipUserId() != null ||
      user.id === this.currentUserId()
    ) {
      return;
    }

    const confirmed = await this.dialogService.openSimpleDialog({
      title: { key: "revokeServerUserOrganizationAccess" },
      content: {
        key: "revokeServerUserOrganizationAccessConfirmation",
        placeholders: [user.email],
      },
      type: "warning",
      acceptButtonText: { key: "revoke" },
      cancelButtonText: { key: "cancel" },
    });

    if (!confirmed) {
      return;
    }

    this.updatingMembershipUserId.set(user.id);

    try {
      await this.apiService.send(
        "PUT",
        `/admin/users/${user.id}/organizations/${orgId}/revoke`,
        null,
        true,
        true,
      );
      await this.loadUsers();
      this.toastService.showToast({
        variant: "success",
        title: null,
        message: this.i18nService.t("revokedServerUserOrganizationAccess", user.email),
      });
    } catch (error) {
      this.logService.error(error);
      this.toastService.showToast({
        variant: "error",
        title: null,
        message: this.i18nService.t("revokeServerUserOrganizationAccessFailed"),
      });
    } finally {
      this.updatingMembershipUserId.set(null);
    }
  }

  protected organizationNames(user: ServerUser): string[] {
    return user.organizations
      .map((organization) => {
        if (organization.name == null || organization.name.trim().length === 0) {
          return null;
        }
        const status = this.organizationMembershipStatusKey(organization);
        return status == null
          ? organization.name
          : `${organization.name} (${this.i18nService.t(status)})`;
      })
      .filter((name): name is string => name != null && name.trim().length > 0)
      .sort(this.i18nService.collator?.compare);
  }

  protected currentOrganizationMembership(user: ServerUser): ServerUserOrganization | null {
    const orgId = this.organizationId();
    if (orgId == null) {
      return null;
    }
    return user.organizations.find((organization) => organization.id === orgId) ?? null;
  }

  protected canAddToCurrentOrganization(user: ServerUser): boolean {
    const membership = this.currentOrganizationMembership(user);
    return membership == null || this.isRevokedMembership(membership);
  }

  protected canRevokeCurrentOrganizationAccess(user: ServerUser): boolean {
    const membership = this.currentOrganizationMembership(user);
    return (
      membership != null &&
      !this.isRevokedMembership(membership) &&
      user.id !== this.currentUserId()
    );
  }

  protected isRevokedMembership(membership: Pick<ServerUserOrganization, "status">): boolean {
    return (
      membership.status === organizationUserStatus.revoked ||
      membership.status === organizationUserStatus.revokedLegacy
    );
  }

  protected organizationMembershipStatusKey(
    membership: Pick<ServerUserOrganization, "status">,
  ): string | null {
    switch (membership.status) {
      case organizationUserStatus.invited:
        return "invited";
      case organizationUserStatus.accepted:
        return "accepted";
      case organizationUserStatus.confirmed:
        return "confirmed";
      case organizationUserStatus.revoked:
      case organizationUserStatus.revokedLegacy:
        return "revoked";
      default:
        return null;
    }
  }

  private async initialize() {
    const [currentUserId, routeParams] = await Promise.all([
      firstValueFrom(this.accountService.activeAccount$.pipe(getUserId)),
      firstValueFrom(this.route.params),
    ]);
    this.currentUserId.set(currentUserId);
    this.organizationId.set(routeParams.organizationId ?? null);
    await this.loadUsers();
  }
}
