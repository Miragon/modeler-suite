workspace {
    !impliedRelationships false
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
        }
        crm = softwareSystem "CRM"
        web -> crm "Syncs customers"
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.crm" "400,0"
                "c4modeler.element.shop" "0,0"
            }
        }
    }
}
