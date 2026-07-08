import { NO_ERRORS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { mock, MockProxy } from "jest-mock-extended";
import { NEVER, of } from "rxjs";

import { PolicyApiServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/policy/policy-api.service.abstraction";
import { PolicyType } from "@bitwarden/common/admin-console/enums";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { PolicyResponse } from "@bitwarden/common/admin-console/models/response/policy.response";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { OrganizationId } from "@bitwarden/common/types/guid";
import { DIALOG_DATA, DialogRef, DialogService, ToastService } from "@bitwarden/components";
import { KeyService } from "@bitwarden/key-management";

import { BasePolicyEditComponent, BasePolicyEditDefinition } from "./base-policy-edit.component";
import { PolicyCategory } from "./pipes/policy-category";
import { PolicyEditDialogData, PolicyEditDialogResult } from "./policy-edit-dialog.component";
import { PolicyEditDrawerComponent } from "./policy-edit-drawer.component";

const ORG_ID = "org1" as OrganizationId;

const dialogData: PolicyEditDialogData = {
  policy: {
    name: "testPolicy",
    description: "testDesc",
    type: PolicyType.ResetPassword,
    component: class {} as any,
    showDescription: true,
    display$: () => of(true),
    category: PolicyCategory.DataControl,
    priority: 1,
  } as BasePolicyEditDefinition,
  organization: { id: ORG_ID } as Organization,
};

describe("PolicyEditDrawerComponent", () => {
  let component: PolicyEditDrawerComponent;
  let fixture: ComponentFixture<PolicyEditDrawerComponent>;
  let policyApiService: MockProxy<PolicyApiServiceAbstraction>;

  beforeEach(async () => {
    policyApiService = mock<PolicyApiServiceAbstraction>();

    const accountService = mock<AccountService>();
    accountService.activeAccount$ = NEVER;

    const authService = mock<AuthService>();
    authService.authStatusFor$.mockReturnValue(NEVER);

    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      providers: [
        { provide: DIALOG_DATA, useValue: dialogData },
        { provide: AccountService, useValue: accountService },
        { provide: AuthService, useValue: authService },
        { provide: PolicyApiServiceAbstraction, useValue: policyApiService },
        { provide: I18nService, useValue: mock<I18nService>() },
        { provide: DialogRef, useValue: mock<DialogRef<PolicyEditDialogResult>>() },
        { provide: ToastService, useValue: mock<ToastService>() },
        { provide: KeyService, useValue: mock<KeyService>() },
        { provide: DialogService, useValue: mock<DialogService>() },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(PolicyEditDrawerComponent);
    component = fixture.componentInstance;
  });

  it("passes organizationId to the dynamically loaded policy component", async () => {
    policyApiService.getPolicy.mockResolvedValue(
      new PolicyResponse({ Enabled: true, CanToggleState: true }),
    );

    const mockComponentRef = {
      instance: { enabled: new FormControl(true) } as Partial<BasePolicyEditComponent>,
      setInput: jest.fn(),
    };

    (component as any).policyFormRef = jest
      .fn()
      .mockReturnValue({ createComponent: jest.fn().mockReturnValue(mockComponentRef) });

    await component.ngAfterViewInit();

    expect(mockComponentRef.setInput).toHaveBeenCalledWith("organizationId", ORG_ID);
  });
});
