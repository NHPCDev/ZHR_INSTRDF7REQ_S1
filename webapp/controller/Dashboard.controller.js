sap.ui.define([
    "com/nhpc/zhrinstrdf7reqs1/controller/BaseController",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/export/Spreadsheet",
    "sap/ui/core/Fragment",
    "sap/ui/core/ValueState",
    "com/nhpc/zhrinstrdf7reqs1/utils/formatter",
    "com/nhpc/zhrinstrdf7reqs1/utils/messenger",
    "sap/ui/core/BusyIndicator",
], (BaseController, Filter, FilterOperator, Spreadsheet, Fragment, ValueState, formatter, messenger, BusyIndicator) => {
    "use strict";

    return BaseController.extend("com.nhpc.zhrinstrdf7reqs1.controller.Dashboard", {
        formatter: formatter,
        onInit() {
            this.getRouter().getRoute("RouteDashboard").attachPatternMatched(this._onRoutePatternMatched, this);
        },

        _onRoutePatternMatched: function (oEvent) {
            this.getModel().refresh();
        },

        onDashboardTableUpdateFinish: function (oEvent) {
            var oResourceBundle = this.getResourceBundle(),
                iCount = oEvent.getParameter("total");
            var sTitle = oResourceBundle.getText("dashboardTableTitle") + " (" + iCount + ")";
            this.byId("dashBoardTitle").setText(sTitle);
        },

        onCreate: function () {
            let oView = this.getView();
            let oViewModel = this.getModel("viewModel");
            oViewModel.setProperty("/valueState/selectedYear", ValueState.None);
            oViewModel.setProperty("/valueStateText/selectedYear", null);
            oViewModel.setProperty("/selectedYear", null);

            if (!this.oCreateDialog) {
                this.oCreateDialog = Fragment.load({
                    name: "com.nhpc.zhrinstrdf7reqs1.fragment.Create",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    oDialog.open();
                    return oDialog;
                });
            } else {
                this.oCreateDialog.then(function (oDialog) {
                    oDialog.open();
                });
            }
        },
        onYearSelect: async function () {
            BusyIndicator.show(0);
            let oViewModel = this.getModel("viewModel");
            let oResourceBundle = this.getResourceBundle();
            let selectedYear = oViewModel.getProperty("/selectedYear");
            if (!selectedYear) {
                oViewModel.setProperty("/valueState/selectedYear", ValueState.Error);
                oViewModel.setProperty("/valueStateText/selectedYear", this.getResourceBundle().getText("yearRequiredError"));
                BusyIndicator.hide();
                return;
            }
            oViewModel.setProperty("/valueState/selectedYear", ValueState.None);
            oViewModel.setProperty("/valueStateText/selectedYear", null);
            this.oCreateDialog.then(function (oDialog) {
                oDialog.close();
            });
            let oModel = this.getModel();
            let aFilters = [];
            aFilters.push(new Filter("Year", FilterOperator.EQ, selectedYear));
            // aFilters.push(new Filter("Status", FilterOperator.EQ, "NEW"));
            await this.resetModel();
            await new Promise((resolve, reject) => {
                oModel.read("/PreapprovedSet", {
                    filters: aFilters,
                    success: function (oData) {
                        let applicationSet = oData.results.filter(i => i.Status === "New").map(i => i.ApplicationNo);
                        oViewModel.setProperty(
                            "/applicatinNoSet",
                            applicationSet
                        );
                        if (applicationSet.length === 0) {
                            BusyIndicator.hide();
                            messenger.error(oResourceBundle.getText("noDataErrorMsg"));
                            return;
                        }
                        let sText = oData.results[0].UndertakingText;

                        let aLines = sText.split("\n");
                        let aDocs = [];
                        let aIntro = [];
                        let aDeclaration = [];

                        let aFlags = [
                            "ContractNoteFlg",
                            "PaymentProofFlg",
                            "BankStatementFlg",
                            "DeliverySlipFlg"
                        ];

                        let iDocIndex = 0;
                        let bDocSection = false;
                        let bDeclarationSection = false;

                        aLines.forEach(function (line) {

                            if (/^\d+\)/.test(line.trim())) {
                                bDocSection = true;

                                aDocs.push({
                                    text: line.replace(/^\d+\)\s*/, ""),
                                    flagPath: "/formDetails/" + aFlags[iDocIndex]
                                });

                                iDocIndex++;
                                return;
                            }

                            if (bDocSection) {
                                bDeclarationSection = true;
                            }

                            if (!bDocSection) {
                                aIntro.push(line);
                            } else if (bDeclarationSection) {
                                aDeclaration.push(line);
                            }
                        });
                        oViewModel.setProperty("/formDetails/HeaderText", oData.results[0].HeaderText);
                        oViewModel.setProperty("/undertakingIntro", aIntro.join("\n"));
                        oViewModel.setProperty("/undertakingDocs", aDocs);
                        oViewModel.setProperty("/undertakingDeclaration", aDeclaration.join("\n"));
                        BusyIndicator.hide();
                        resolve();
                    },
                    error: function (oError) {
                        BusyIndicator.hide();
                        let oResponse = JSON.parse(oError.responseText);
                        let sMessage = oResponse.error.message.value;
                        messenger.error(sMessage);
                        reject(oError);
                    }
                });
            });

            this.getRouter().navTo("RouteDetail", {
                Year: selectedYear,
                ApplicationNo: "New",
                Pernr: "New"
            });
        },
        resetModel: function () {
            let oViewModel = this.getModel("viewModel");
            oViewModel.setProperty("/tableData", []);
            oViewModel.setProperty("/formDetails", {});
            oViewModel.setProperty("/selectedSecurityDetails", {});
        },
        onCloseDialog: function () {
            this.oCreateDialog.then(function (oDialog) {
                oDialog.close();
            });
        },

        onListItemPress: async function (oEvent) {
            await this.resetModel();
            var oObject = oEvent.getSource()
                .getBindingContext()
                .getObject();

            this.getRouter().navTo("RouteDetail", {
                Year: "No",
                ApplicationNo: oObject.ApplicationNo,
                Pernr: oObject.Pernr
            });
        },

        onSearchBtn: function (oEvent) {
            var oTable = this.byId("idDashboardTable");
            let oFilterData = this._getTableFilters();
            oTable.getBinding("items").filter(oFilterData.aFilters);
        },

        _getTableFilters: function (oEvent) {
            var oViewModel = this.getView().getModel("viewModel"),
                oFilterData = oViewModel.getProperty("/filterData"),
                aSearchFilter = [];

            if (oFilterData.ApplicationNo) {
                let aFilters = [];
                aFilters.push(new Filter("ApplicationNo", FilterOperator.Contains, oFilterData.ApplicationNo));
                aSearchFilter.push(new Filter({
                    filters: aFilters,
                    and: false
                }));
            }
            if (oFilterData.ConfirmedOn) {
                let aFilters = [];
                aFilters.push(new Filter("ConfirmedOn", FilterOperator.EQ, oFilterData.ConfirmedOn));
                aSearchFilter.push(new Filter({
                    filters: aFilters,
                    and: false
                }));
            }
            if (oFilterData.AcceptedOn) {
                let aFilters = [];
                aFilters.push(new Filter("AcceptedOn", FilterOperator.EQ, oFilterData.AcceptedOn));
                aSearchFilter.push(new Filter({
                    filters: aFilters,
                    and: false
                }));
            }
            if (oFilterData.Status) {
                let aFilters = [];
                aFilters.push(new Filter("Status", FilterOperator.EQ, oFilterData.Status));
                aSearchFilter.push(new Filter({
                    filters: aFilters,
                    and: false
                }));
            }

            return {
                aFilters: aSearchFilter.length
                    ? [new Filter({
                        filters: aSearchFilter,
                        and: true
                    })]
                    : []
            }
        },
        onDownload: function () {
            var oModel = this.getModel();
            let oResourceBundle = this.getResourceBundle();
            BusyIndicator.show(0);
            oModel.read("/PreapprovedSet", {
                filters: [
                    new sap.ui.model.Filter(
                        "ApproverFlag",
                        sap.ui.model.FilterOperator.EQ,
                        "R"
                    )
                ],
                success: function (oData) {
                    var aData = oData.results.map(function (oData) {
                        var oRow = Object.assign({}, oData);
                        oRow.ConfirmedOn =
                            formatter.formatDate(oRow.ConfirmedOn);
                        oRow.AcceptedOn =
                            formatter.formatDate(oRow.AcceptedOn);
                        oRow.DatePlacementCOD =
                            formatter.formatDate(oRow.DatePlacementCOD);
                        oRow.CreatedOn =
                            formatter.formatDate(oRow.CreatedOn);
                        return oRow;
                    });
                    var oSettings = {
                        workbook: {
                            columns: this.createColumnConfig()
                        },
                        dataSource: aData,
                        fileType: "xlsx",
                        fileName: this.getResourceBundle().getText("title")
                    };
                    var oSheet = new Spreadsheet(oSettings);
                    oSheet.build()
                        .finally(function () {
                            oSheet.destroy();
                            BusyIndicator.hide();
                        });
                }.bind(this),
                error: function () {
                    BusyIndicator.hide();
                    messenger.error(oResourceBundle.getText("failedToDownloadData"));
                }
            });
        },
        createColumnConfig: function () {
            var aCols = [];
            aCols.push({
                label: this.getResourceBundle().getText("applicationNo"),
                property: "ApplicationNo"
            });
            aCols.push({
                label: this.getResourceBundle().getText("employeeIdLabel"),
                property: "Pernr"
            });
            aCols.push({
                label: this.getResourceBundle().getText("employeeNameLabel"),
                property: "EmployeeName"
            });
            aCols.push({
                label: this.getResourceBundle().getText("ConfirmedOn"),
                property: "ConfirmedOn"
            });
            aCols.push({
                label: this.getResourceBundle().getText("ConfirmedBy"),
                property: "ConfirmBy"
            });
            aCols.push({
                label: this.getResourceBundle().getText("acceptedOn"),
                property: "AcceptedOn"
            });
            aCols.push({
                label: this.getResourceBundle().getText("acceptedBy"),
                property: "AcceptedBy"
            });
            aCols.push({
                label: this.getResourceBundle().getText("status"),
                property: "Status"
            });
            return aCols;
        },


    });
});