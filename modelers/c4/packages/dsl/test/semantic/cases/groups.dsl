workspace {
    model {
        properties {
            "structurizr.groupSeparator" "/"
        }
        company = group "Company" {
            sales = group "Sales" {
                rep = person "Rep"
                crm = softwareSystem "CRM" {
                    group "Front" {
                        ui = container "UI"
                        group "Inner" {
                            widget = container "Widget" {
                                part = component "Part" {
                                    group "Parts"
                                    group "Small"
                                }
                            }
                        }
                    }
                    backend = container "Backend"
                }
            }
            erp = softwareSystem "ERP"
        }
        loner = softwareSystem "Loner"
        group "Moved" {
            !element loner
        }
        rep -> crm "Uses"
        ui -> backend "Calls"
        crm -> erp "Syncs"
    }
    views {
        systemLandscape "Landscape" {
            include *
        }
        container crm "CrmContainers" {
            include *
        }
        component widget "WidgetComponents" {
            include *
        }
        systemLandscape "Sales" {
            include sales
        }
    }
}
