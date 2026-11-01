workspace "Shop" {
    model {
        archetypes {
            https = -> {
                technology "HTTPS"
            }
        }
        shop = softwareSystem "Shop" {
            web = container "Web"
        }
        crm = softwareSystem "CRM"
        web --https-> crm "Syncs customers"
    }
    views {
        systemLandscape "Landscape" {
            include *
            autoLayout tb 300 160
        }
    }
}
