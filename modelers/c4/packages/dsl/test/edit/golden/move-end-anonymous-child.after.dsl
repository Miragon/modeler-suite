workspace "Shop" {
    model {
        shop = softwareSystem "Shop" {
            webApp = container "Web App"
        }
        crm = softwareSystem "CRM"
        webApp -> crm "Syncs customers"
    }
    views {
        systemLandscape "Landscape" {
            include *
            autoLayout tb 300 160
        }
    }
}
