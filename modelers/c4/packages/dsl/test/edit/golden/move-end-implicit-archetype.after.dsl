workspace "Shop" {
    model {
        archetypes {
            https = -> {
                technology "HTTPS"
            }
        }
        crm = softwareSystem "CRM"
        shop = softwareSystem "Shop" {
            web = container "Web"
            web --https-> crm "Syncs customers"
        }
    }
    views {
        systemLandscape "Landscape" {
            include *
            autoLayout tb 300 160
        }
    }
}
