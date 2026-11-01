workspace "Shop" {
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
        }
        crm = softwareSystem "CRM"
        group "Integrations" {
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
