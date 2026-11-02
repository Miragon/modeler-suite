workspace {
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
        }
        crm = softwareSystem "CRM"
        crm -> web "Sends leads to"
    }
    views {
        systemLandscape "Landscape" {
            include *
            properties {
                "c4modeler.element.crm" "0,0"
                "c4modeler.element.shop" "400,0"
                "c4modeler.relationship.implied:crm->shop" "320,-80"
            }
        }
    }
}
