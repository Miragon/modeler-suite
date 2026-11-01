workspace {
    model {
        group "Internal" {
            billing = softwareSystem "Billing"
        }
        clerk = person "Clerk"
        payments = softwareSystem "Payments"
    }
    views {
        systemLandscape "Landscape" {
            include *
            autoLayout tb 300 160
            properties {
                "c4modeler.element.payments" "0,0"
            }
        }
    }
}
