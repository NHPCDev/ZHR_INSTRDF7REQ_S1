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
    "sap/ui/core/format/NumberFormat",
], (BaseController, Filter, FilterOperator, Spreadsheet, Fragment, ValueState, formatter, messenger, BusyIndicator, NumberFormat) => {
    "use strict";

    return BaseController.extend("com.nhpc.zhrinstrdf7reqs1.controller.Detail", {
        formatter: formatter,
        onInit() {
            this.getRouter().getRoute("RouteDetail").attachPatternMatched(this._onRoutePatternMatched, this);
        },

        _onRoutePatternMatched: async function (oEvent) {
            let oArgs = oEvent.getParameter("arguments");
            let sApplicationNo = oArgs.ApplicationNo;
            this.sApplicationNo = sApplicationNo;
            let sYear = oArgs.Year;
            let sPernr = oArgs.Pernr;
            let oViewModel = this.getModel("viewModel");
            let oModel = this.getModel();
            let applicatinNoSet = oViewModel.getProperty("/applicatinNoSet");
            BusyIndicator.show(0);
            try {
                if (sApplicationNo === "New") {
                    oViewModel.setProperty("/selectedYear", sYear);
                    oViewModel.setProperty("/formDetails/Status", "New");
                    this.byId("objPageHeader").setText(this.getResourceBundle().getText("createDialogTitle", this.getModel("viewModel").getProperty("/selectedYear")));
                    this.byId("objPageHeader1").setText(this.getResourceBundle().getText("createDialogTitle", this.getModel("viewModel").getProperty("/selectedYear")));
                    if (!applicatinNoSet) {
                        let aFilters = [];
                        aFilters.push(new Filter("Year", FilterOperator.EQ, sYear));
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
                    }
                } else {
                    await this.setFormDetails(sApplicationNo);
                    await this.onApplicationNoChange();
                    this.byId("objPageHeader").setText(this.getResourceBundle().getText("editDialogTitle", sApplicationNo));
                    this.byId("objPageHeader1").setText(this.getResourceBundle().getText("editDialogTitle", sApplicationNo));
                }
                oViewModel.setProperty("/selectedYear", sYear);
                await this.resetValueStates();
                await this.getDefaultEmployeeDetails(sPernr);
            } catch (oError) {
                messenger.error(JSON.parse(oError.responseText).error.message.value, function () {
                    this.getRouter().navTo("RouteDashboard", {}, {}, true);
                }.bind(this));
            } finally {
                BusyIndicator.hide();
            }
        },

        _getHistoryWithRemarksData: function (Pernr) {
            var oModel = this.getModel();
            var oVM = this.getModel("viewModel");

            var aFilters = [
                new Filter("Pernr", FilterOperator.EQ, Pernr),
                new Filter("FormNo", FilterOperator.EQ, "FORM7"),
                new Filter("ApplicationNo", FilterOperator.EQ, this.sApplicationNo)
            ];

            oModel.read("/RemarkHistorySet", {
                filters: aFilters,
                success: function (oData) {
                    oVM.setProperty("/History", oData.results);
                    console.log("History Data", oData.results);
                }.bind(this),

                error: function () {
                    MessageBox.error("unableToFetchApplicationDetails");
                }
            });
        },

        setFormDetails: async function (sApplicationNo) {
            let oModel = this.getModel();
            let oViewModel = this.getModel("viewModel");
            let aFilters = new Filter("ApplicationNo", FilterOperator.EQ, sApplicationNo);
            await new Promise((resolve, reject) => {
                oModel.read("/PreapprovedSet", {
                    filters: [aFilters],
                    urlParameters: {
                        "$expand": "PREAPPROVED_TO_SECURITY"
                    },
                    success: function (oData) {
                        if (oData.results.length === 0) {
                            messenger.error("No Data Found");
                            return;
                        }
                        oViewModel.setProperty(
                            "/applicatinNoSet",
                            oData.results.map(i => i.ApplicationNo)
                        );
                        oViewModel.setProperty("/formDetails", {
                            ...oViewModel.getProperty("/formDetails"),
                            ...oData.results[0]
                        });
                        oViewModel.setProperty("/tableData", oData.results[0].PREAPPROVED_TO_SECURITY.results)
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
                                    selected: true
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

                        oViewModel.setProperty("/undertakingIntro", aIntro.join("\n"));
                        oViewModel.setProperty("/undertakingDocs", aDocs);
                        oViewModel.setProperty("/undertakingDeclaration", aDeclaration.join("\n"));
                        resolve();
                    },
                    error: function (oError) {
                        messenger.error(JSON.parse(oError.responseText).error.message.value, function () {
                            this.getRouter().navTo("RouteDashboard", {}, {}, true);
                        }.bind(this));
                        reject(oError);
                    }
                });
            });
        },

        resetValueStates: function () {
            let oViewModel = this.getModel("viewModel");
            oViewModel.setProperty("/valueState/HolderName", "None");
            oViewModel.setProperty("/valueState/HolderType", "None");
            oViewModel.setProperty("/valueState/NoOfSecurities", "None");
            oViewModel.setProperty("/valueState/TransactionType", "None");
            oViewModel.setProperty("/valueState/DpClientId", "None");
            oViewModel.setProperty("/valueState/Price", "None");

            oViewModel.setProperty("/valueStateText/HolderName", null);
            oViewModel.setProperty("/valueStateText/HolderType", null);
            oViewModel.setProperty("/valueStateText/NoOfSecurities", null);
            oViewModel.setProperty("/valueStateText/TransactionType", null);
            oViewModel.setProperty("/valueStateText/DpClientId", null);
            oViewModel.setProperty("/valueStateText/Price", null);
        },

        getDefaultEmployeeDetails: function (sPernr) {
            return new Promise((resolve, reject) => {
                let oModel = this.getModel(),
                    oViewModel = this.getModel("viewModel");


                let aFilters = [
                    new Filter(
                        "PERNR",
                        FilterOperator.EQ,
                        sPernr
                    )
                ];
                if (sPernr === "New") {
                    aFilters = [
                        new Filter(
                            "DFLT",
                            FilterOperator.EQ,
                            "X"
                        )
                    ];
                }

                oModel.read("/ZFI_GH_USER_F4", {
                    filters: aFilters,
                    success: async function (oResp) {
                        if (oResp.results && oResp.results.length > 0) {
                            oViewModel.setProperty("/formDetails/EmployeeId", oResp.results[0].PERNR);
                            oViewModel.setProperty("/formDetails/EmployeeName", oResp.results[0].ENAME);
                            oViewModel.setProperty("/formDetails/CompanyCode", oResp.results[0].BUKRS);
                            oViewModel.setProperty("/formDetails/EmployeeGrade", oResp.results[0].GRADE);
                            oViewModel.setProperty("/formDetails/EmployeeSubgrp", oResp.results[0].SUB_GROUP);
                            oViewModel.setProperty("/formDetails/EmployeeSubgrpText", oResp.results[0].GRADE);
                            oViewModel.setProperty("/formDetails/PersonnelSubArea", oResp.results[0].WERKS);
                            oViewModel.setProperty("/formDetails/PersonnelSubAreaText", oResp.results[0].PLANT);
                            oViewModel.setProperty("/formDetails/EmployeeDepartment", `${oResp.results[0].DEP_CODE} - ${oResp.results[0].DEP}`);
                            oViewModel.setProperty("/formDetails/PositionText", oResp.results[0].DESIG);
                        }
                        await this._getHistoryWithRemarksData(oResp.results[0].PERNR);
                        resolve();
                    }.bind(this),
                    error: function (oError) {
                        messenger.error(JSON.parse(oError.responseText).error.message.value, function () {
                            this.getRouter().navTo("RouteDashboard", {}, {}, true);
                        }.bind(this));
                        reject(oError);
                    }.bind(this)
                });
            });
        },

        onTableUpdateFinish: function () {
            let oViewModel = this.getModel("viewModel");
            oViewModel.setProperty("/tableLength", oViewModel.getProperty("/tableData").length ?? 0);
        },

        onApplicationNoChange: async function () {
            let oViewModel = this.getModel("viewModel");
            let oModel = this.getModel();
            let oFormDetails = oViewModel.getProperty("/formDetails");
            let sApplicationNo = oViewModel.getProperty("/formDetails/ApplicationNo");
            let aFilters = [new Filter("ApplicationNo", FilterOperator.EQ, sApplicationNo), new Filter("ApprovalFlag", FilterOperator.EQ, 'R')];
            if (sApplicationNo) {
                await new Promise((resolve, reject) => {
                    BusyIndicator.show(0);
                    oModel.read("/PreClearSet", {
                        filters: aFilters,
                        success: function (oData) {
                            oViewModel.setProperty("/formDetails/TransactionType", oData.results[0].NatureOfNewTransaction);
                            oViewModel.setProperty("/formDetails/DisclosureDate", oData.results[0].ApprovedOn);
                            oViewModel.setProperty("/formDetails/DPClientID", oData.results[0].FolioNoDPClientID);
                            oViewModel.setProperty("/formDetails/ValidityDate", oData.results[0].ValidityDate);
                            oViewModel.setProperty("/formDetails/SecurityDescription", oData.results[0].Natureofsecurity);
                            oViewModel.setProperty("/formDetails/PAN",oData.results[0].PAN)
                            if(oData.results[0].SelfOrRelative === "SELF"){
                                oViewModel.setProperty("/formDetails/HolderName",oData.results[0].EmployeeName);
                            } else {
                                oViewModel.setProperty("/formDetails/HolderName",oData.results[0].ImmediateRelativeName);
                            }
                            BusyIndicator.hide();
                            resolve();
                        },
                        error: function () {
                            BusyIndicator.hide();
                            reject();
                        }
                    })
                })
            }
        },

        onAmountChange: function (oEvent) {
            var oSrc = oEvent.getSource(),
                sValue = oEvent.getParameter("value"),
                oResourceBundle = this.getResourceBundle(),
                oFormatter = NumberFormat.getCurrencyInstance(),
                oViewModel = this.getModel("viewModel"),
                sPath = oSrc.data("path");
            if (!sValue) {
                return;
            }
            oViewModel.setProperty("/valueState/Price", "None");
            oViewModel.setProperty("/valueStateText/Price", "");

            let sParsedValue = sValue;
            if (sParsedValue.includes("INR")) {
                const aParsed = oFormatter.parse(sParsedValue);
                sParsedValue = aParsed ? aParsed[0].toString() : "";
            }
            const oRegex = /^\d+(\.\d{0,2})?$/
            if (!oRegex.test(sParsedValue)) {
                oViewModel.setProperty("/selectedSecurityDetails/Price", "");
                oViewModel.setProperty("/valueState/Price", "Error");
                oViewModel.setProperty("/valueStateText/Price", oResourceBundle.getText("errMsgPositiveValue"));
                messenger.error(
                    oResourceBundle.getText("errMsgPositiveValue")
                );
                return;
            }
            let sFormattedValue = parseFloat(sParsedValue)
                .toFixed(2)
                .toString();
            if (sPath) {
                oViewModel.setProperty(sPath, sFormattedValue);
            }
            oSrc.setValue(
                formatter.formatAmountToINR(sFormattedValue)
            );
        },


        checkSecurityDetailsValidation: function (oSecurityDetails) {
            let oViewModel = this.getModel("viewModel");
            let errors = [];
            if (!oSecurityDetails.HolderName) {
                oViewModel.setProperty("/valueState/HolderName", ValueState.Error);
                oViewModel.setProperty("/valueStateText/HolderName", this.getResourceBundle().getText("nameOfTheHolderRequired"));
                errors.push(this.getResourceBundle().getText("nameOfTheHolderRequired"));
            } else {
                oViewModel.setProperty("/valueState/HolderName", ValueState.None);
                oViewModel.setProperty("/valueStateText/HolderName", null);
            }
            if (!oSecurityDetails.NoOfSecurities) {
                oViewModel.setProperty("/valueState/NoOfSecurities", ValueState.Error);
                oViewModel.setProperty("/valueStateText/NoOfSecurities", this.getResourceBundle().getText("numberOfSecuritiesRequired"));
                errors.push(this.getResourceBundle().getText("numberOfSecuritiesRequired"));
            } else {
                oViewModel.setProperty("/valueState/NoOfSecurities", ValueState.None);
                oViewModel.setProperty("/valueStateText/NoOfSecurities", null);
            }
            if (!oSecurityDetails.TransactionType) {
                oViewModel.setProperty("/valueState/TransactionType", ValueState.Error);
                oViewModel.setProperty("/valueStateText/TransactionType", this.getResourceBundle().getText("boughtSoldSubscribedRequired"));
                errors.push(this.getResourceBundle().getText("boughtSoldSubscribedRequired"));
            } else {
                oViewModel.setProperty("/valueState/TransactionType", ValueState.None);
                oViewModel.setProperty("/valueStateText/TransactionType", null);
            }
            if (!oSecurityDetails.DPClientID) {
                oViewModel.setProperty("/valueState/DpClientId", ValueState.Error);
                oViewModel.setProperty("/valueStateText/DpClientId", this.getResourceBundle().getText("dpIdClientIdRequired"));
                errors.push(this.getResourceBundle().getText("dpIdClientIdRequired"));
            } else {
                oViewModel.setProperty("/valueState/DpClientId", ValueState.None);
                oViewModel.setProperty("/valueStateText/DpClientId", null);
            }
            if (!oSecurityDetails.Price) {
                oViewModel.setProperty("/valueState/Price", ValueState.Error);
                oViewModel.setProperty("/valueStateText/Price", this.getResourceBundle().getText("priceRequired"));
                errors.push(this.getResourceBundle().getText("priceRequired"));
            } else {
                oViewModel.setProperty("/valueState/Price", ValueState.None);
                oViewModel.setProperty("/valueStateText/Price", null);
            }
            if (!oSecurityDetails.TransactionDate) {
                oViewModel.setProperty("/valueState/TransactionDate", ValueState.Error);
                oViewModel.setProperty("/valueStateText/TransactionDate", this.getResourceBundle().getText("transactionRequired"));
                errors.push(this.getResourceBundle().getText("priceRequired"));
            } else {
                oViewModel.setProperty("/valueState/TransactionDate", ValueState.None);
                oViewModel.setProperty("/valueStateText/TransactionDate", null);
            }
            return errors.length === 0;
        },

        onAddSecurityDetails: async function () {
            await this.resetValueStates();
            let oView = this.getView();
            let oViewModel = this.getModel("viewModel");
            oViewModel.setProperty("/selectedSecurityDetails", {
                DPClientID: oViewModel.getProperty("/formDetails/DPClientID"),
                TransactionType: oViewModel.getProperty("/formDetails/TransactionType"),
                HolderName: oViewModel.getProperty("/formDetails/HolderName"),
                PanNumber: oViewModel.getProperty("/formDetails/PAN")
            });
            oViewModel.setProperty("/selectedSecurityIndex", null);
            if (!this.oAddDialog) {
                this.oAddDialog = await Fragment.load({
                    name: "com.nhpc.zhrinstrdf7reqs1.fragment.SecurityDetails",
                    controller: this
                });
                oView.addDependent(this.oAddDialog);
            }
            this.oAddDialog.open();
        },

        onSaveSecurityDetails: function () {
            let oViewModel = this.getModel("viewModel");
            let oSecurityDetails = oViewModel.getProperty("/selectedSecurityDetails");
            let sNatureOfSecurity = oViewModel.getProperty("/formDetails/SecurityDescription");
            oViewModel.setProperty("/selectedSecurityDetails/NatureOfSecurity", sNatureOfSecurity);
            let oTableData = oViewModel.getProperty("/tableData") || [];
            let isEdit = oViewModel.getProperty("/selectedSecurityIndex") !== null;
            let isValid = this.checkSecurityDetailsValidation(oSecurityDetails);
            if (!isValid) {
                messenger.error(this.getResourceBundle().getText("fillAllRequiredFields"));
                return;
            }
            if (isEdit) {
                let index = oViewModel.getProperty("/selectedSecurityIndex");
                oTableData[index] = oSecurityDetails;
            } else {
                const oNow = new Date();
                const sDate =
                    oNow.getFullYear().toString() +
                    String(oNow.getMonth() + 1).padStart(2, "0") +
                    String(oNow.getDate()).padStart(2, "0");
                const sTime =
                    String(oNow.getHours()).padStart(2, "0") +
                    String(oNow.getMinutes()).padStart(2, "0") +
                    String(oNow.getSeconds()).padStart(2, "0");
                oViewModel.setProperty("/selectedSecurityDetails/Createdon", sDate);
                oViewModel.setProperty("/selectedSecurityDetails/CreatedAt", sTime);
                oTableData.push(oSecurityDetails);
            }
            oViewModel.setProperty("/tableData", oTableData);
            oViewModel.setProperty("/selectedSecurityDetails", {});
            this.oAddDialog.close();
        },

        onEditSecurityDetails: async function () {
            await this.resetValueStates();
            const oTable = this.byId("idSecurityTable");
            let oViewModel = this.getModel("viewModel");
            const oSelectedItem = oTable.getSelectedItem();
            if (!oSelectedItem) {
                messenger.error(this.getResourceBundle().getText("selectRowToEdit"));
                return;
            }
            const oContext = oSelectedItem.getBindingContext("viewModel");
            const oSelectedObject = oContext.getObject();
            oViewModel.setProperty(
                "/selectedSecurityDetails",
                Object.assign({}, oSelectedObject)
            );
            oViewModel.setProperty("/selectedSecurityDetails", {
                ...oViewModel.getProperty("/selectedSecurityDetails"),
                DPClientID: oViewModel.getProperty("/formDetails/DPClientID"),
                TransactionType: oViewModel.getProperty("/formDetails/TransactionType")
            });
            this.getModel("viewModel").setProperty("/selectedSecurityIndex", oContext.getPath().split("/").pop());
            if (!this.oAddDialog) {
                this.oAddDialog = await Fragment.load({
                    name: "com.nhpc.zhrinstrdf7reqs1.fragment.SecurityDetails",
                    controller: this
                });
                this.getView().addDependent(this.oAddDialog);
            }
            this.oAddDialog.open();
        },

        onDeleteSecurityDetails: function (oEvent) {
            const oTable = this.byId("idSecurityTable");
            const oResourceBundle = this.getResourceBundle();
            const oSelectedItem = oTable.getSelectedItem();
            if (!oSelectedItem) {
                messenger.error(oResourceBundle.getText("selectRowToDelete"));
                return;
            }
            const oContext = oSelectedItem.getBindingContext("viewModel");
            let sIndex = oContext.getPath().split("/").pop();
            let oTableData = this.getModel("viewModel").getProperty("/tableData");
            oTableData.splice(sIndex, 1);
            this.getModel("viewModel").setProperty("/tableData", oTableData);
            messenger.success(oResourceBundle.getText("securityDetailsDeleted"));
        },

        onCancelSecurityDetails: function () {
            this.oAddDialog.close();
        },

        handleSubmitBtnPress: function (oEvent) {
            var oResourceBundle = this.getResourceBundle(),
                sTitle = oResourceBundle.getText("CONFIRM_TITLE"),
                sText = oResourceBundle.getText("CONFIRM_TEXT_FINAL_REQUEST"),
                bProceed = this.validateSubmitRequestDetails();
            var oModel = this.getModel();
            if (bProceed) {
                messenger.confirm(sTitle, sText, "Confirm", null, function () {
                    BusyIndicator.show(0);
                    this.sActionFlag = "Confirmed";
                    let oPayload = this.createRequestPayload();
                    oModel.create("/PreapprovedSet", oPayload, {
                        success: function (oResp) {
                            BusyIndicator.hide();
                            messenger.success(oResourceBundle.getText("FinalSuccessMsg", oResp.ApplicationNo), () => {
                                this.getRouter().navTo("RouteDashboard", {}, {}, true);
                            });
                        }.bind(this),
                        error: function (oError) {
                            BusyIndicator.hide();
                            messenger.error(JSON.parse(oError.responseText).error.message.value);
                        }.bind(this)
                    });
                }.bind(this));
            }
        },
        handleSaveBtnPress: function (oEvent) {
            var oResourceBundle = this.getResourceBundle(),
                sTitle = oResourceBundle.getText("CONFIRM_TITLE"),
                sText = oResourceBundle.getText("CONFIRM_TEXT_SAVE_REQUEST"),
                aErrors = [],
                oViewModel = this.getModel("viewModel"),
                oFormDetails = oViewModel.getProperty("/formDetails");
            var oModel = this.getModel();
            if (!oFormDetails.ApplicationNo) {
                aErrors.push(oResourceBundle.getText("noApplicationNoErrorMsg"));
                oViewModel.setProperty("/valueState/ApplicationNo", "Error");
                oViewModel.setProperty("/valueStateText/ApplicationNo", oResourceBundle.getText("applicationNoErrorMsg"));
            } else {
                oViewModel.setProperty("/valueState/ApplicationNo", "None");
                oViewModel.setProperty("/valueStateText/ApplicationNo", "");
            }
            if (aErrors.length > 0) {
                messenger.error(aErrors.join("\n"));
                return false;
            }
            const aDocs = oViewModel.getProperty("/undertakingDocs");
            const bAllSelected = aDocs.every(function (oDoc) {
                return oDoc.selected;
            });
            if (!bAllSelected && oViewModel.getProperty("/formDetails/TradePerformed") === "Yes") {
                aErrors.push(oResourceBundle.getText("atleastOneUTErrorMsg"));
            }
            if (aErrors.length > 0) {
                messenger.error(aErrors.join("\n"));
                return false;
            }
            messenger.confirm(sTitle, sText, "Confirm", null, function () {
                BusyIndicator.show(0);
                this.sActionFlag = "Draft";
                let oPayload = this.createRequestPayload();
                oModel.create("/PreapprovedSet", oPayload, {
                    success: function (oResp) {
                        BusyIndicator.hide();
                        messenger.success(oResourceBundle.getText("FinalSaveMsg", oResp.ApplicationNo), () => {
                            this.getRouter().navTo("RouteDashboard", {}, {}, true);
                        });
                    }.bind(this),
                    error: function (oError) {
                        BusyIndicator.hide();
                        messenger.error(JSON.parse(oError.responseText).error.message.value);
                    }.bind(this)
                });
            }.bind(this));
        },
        createRequestPayload: function () {
            var oViewModel = this.getModel("viewModel"),
                oFormDetails = oViewModel.getProperty("/formDetails"),
                oTableData = oViewModel.getProperty("/tableData");
            var aDocs = this.getModel("viewModel").getProperty("/undertakingDocs");
            var oPayload = {
                Status: this.sActionFlag,
                ApplicationNo: oFormDetails.ApplicationNo,
                Pernr: oFormDetails.EmployeeId,
                DisclosureDate: oFormDetails.DisclosureDate,
                TradePerformed: oFormDetails.TradePerformed,
                SecurityDescription: oFormDetails.SecurityDescription,
                TransactionDate: oFormDetails.TransactionDate,
                PREAPPROVED_TO_SECURITY: oTableData || [],
                // ContractNoteFlg: aDocs[0].selected ? "X" : "",
                // PaymentProofFlg: aDocs[1].selected ? "X" : "",
                // BankStatementFlg: aDocs[2].selected ? "X" : "",
                // DeliverySlipFlg: aDocs[3].selected ? "X" : ""
            };
            return oPayload;
        },
        validateSubmitRequestDetails: function () {
            const oViewModel = this.getModel("viewModel");
            const oResourceBundle = this.getResourceBundle();
            const oFormDetails = oViewModel.getProperty("/formDetails");
            const sTableData = oViewModel.getProperty("/tableData") || [];
            const aDocs = oViewModel.getProperty("/undertakingDocs");
            const bAllSelected = aDocs.every(function (oDoc) {
                return oDoc.selected;
            });
            const aErrors = [];
            if (!oFormDetails.ApplicationNo) {
                aErrors.push(oResourceBundle.getText("noApplicationNoErrorMsg"));
                oViewModel.setProperty("/valueState/ApplicationNo", "Error");
                oViewModel.setProperty("/valueStateText/ApplicationNo", oResourceBundle.getText("applicationNoErrorMsg"));
            } else {
                oViewModel.setProperty("/valueState/ApplicationNo", "None");
                oViewModel.setProperty("/valueStateText/ApplicationNo", "");
            }
            if (aErrors.length > 0) {
                messenger.error(aErrors.join("\n"));
                return false;
            } else {
                if (sTableData.length === 0 && oViewModel.getProperty("/formDetails/TradePerformed") === "Yes") {
                    aErrors.push(oResourceBundle.getText("shareDetaislsErrorMsg"));
                }
                if (!bAllSelected && oViewModel.getProperty("/formDetails/TradePerformed") === "Yes") {
                    aErrors.push(oResourceBundle.getText("atleastOneUTErrorMsg"));
                }
                if (aErrors.length > 0) {
                    messenger.error(aErrors.join("\n"));
                    return false;
                }
                return true;
            }
        }
    });
});