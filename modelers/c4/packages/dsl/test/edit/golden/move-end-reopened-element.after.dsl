workspace "Shop" {
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
        }
        crm = softwareSystem "CRM"
        !element shop {
            web -> crm "Syncs customers"
        }
    }
    views {
        systemLandscape "Landscape" {
            include *
            autoLayout tb 300 160
        }
    }
}
