workspace "Shop" {
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
        }
        crm = softwareSystem "CRM"
        shop -> crm "Syncs customers"
        webToCrm = web -> crm "Sends orders to"
    }
    views {
        systemLandscape "Landscape" {
            include *
            autoLayout tb 300 160
        }
    }
}
